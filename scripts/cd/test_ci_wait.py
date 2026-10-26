import copy
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import check_ci

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "julianhoelz94/Verfassung"
SHA = "a" * 40
REQUIRED = ["frontend", "mcp-server", "gateway-image", "full-stack-service-artifacts", "backend-services"] + [
    f"images ({name}-service)" for name in
    ["amendment", "audit", "catalog", "content", "document", "editor", "identity", "ingestion", "search"]
]


def green_jobs(attempt=1):
    return [{"id": index + attempt * 1000, "name": name, "run_attempt": attempt,
             "head_sha": SHA, "status": "completed", "conclusion": "success"}
            for index, name in enumerate(REQUIRED)]


def snapshot(jobs=None, status="in_progress", attempt=1, run_id=1):
    run = {"id": run_id, "head_sha": SHA, "head_branch": "main", "event": "push",
           "run_attempt": attempt, "status": status}
    return {"runs": [run], "jobs": {run_id: green_jobs(attempt) if jobs is None else jobs}}


class FakeCI:
    def __init__(self, snapshots):
        self.snapshots = snapshots
        self.index = 0
        self.elapsed = 0
        self.calls = []
        self.sleeps = []

    def now(self):
        return self.elapsed

    def sleep(self, duration):
        self.sleeps.append(duration)
        self.elapsed += duration
        self.index = min(self.index + 1, len(self.snapshots) - 1)

    def get(self, path):
        self.calls.append(path)
        state = self.snapshots[self.index]
        if "/workflows/ci.yml/runs?" in path:
            return {"workflow_runs": copy.deepcopy(state["runs"])}
        run_id = int(path.split("/runs/")[1].split("/")[0])
        if "/jobs?" in path:
            query = parse_qs(urlsplit(path).query)
            if query["filter"] != ["all"]:
                raise AssertionError("Partial CI reruns require the complete job history")
            page = int(query["page"][0])
            return {"jobs": copy.deepcopy(state["jobs"][run_id][(page - 1) * 100:page * 100])}
        return copy.deepcopy(state.get("confirmed", next(run for run in state["runs"] if run["id"] == run_id)))

    def check(self, **kwargs):
        return check_ci.check(REPOSITORY, SHA, ROOT, self.get, sleep=self.sleep,
                              now=self.now, timeout=kwargs.get("timeout", 10), poll_interval=1)


class CIWaitTests(unittest.TestCase):
    def test_waits_for_run_queue_dynamic_jobs_and_compilation(self):
        running = green_jobs()
        running[0].update(status="in_progress", conclusion=None)
        running.pop()  # Matrix jobs may not exist until service discovery finishes.
        ci = FakeCI([{"runs": []}, snapshot(status="queued", jobs=[]),
                     snapshot(jobs=running), snapshot()])
        self.assertEqual(ci.check(), 1)
        self.assertEqual(ci.sleeps, [1, 1, 1])
        query = parse_qs(urlsplit(ci.calls[0]).query)
        self.assertEqual(query["head_sha"], [SHA])
        self.assertEqual(query["branch"], ["main"])
        self.assertEqual(query["event"], ["push"])

    def test_successful_compilation_does_not_wait_for_or_gate_on_e2e(self):
        for status, conclusion in [("in_progress", None), ("completed", "failure")]:
            jobs = green_jobs() + [{"name": "full-stack-e2e", "status": status, "conclusion": conclusion}]
            ci = FakeCI([snapshot(jobs=jobs, status=status)])
            with self.subTest(e2e=conclusion):
                self.assertEqual(ci.check(), 1)
                self.assertEqual(ci.sleeps, [])

    def test_terminal_compilation_results_stop_immediately(self):
        for conclusion in ["failure", "cancelled", "skipped", "timed_out", "neutral", None]:
            jobs = green_jobs()
            jobs[0]["conclusion"] = conclusion
            ci = FakeCI([snapshot(jobs=jobs)])
            with self.subTest(conclusion=conclusion), self.assertRaisesRegex(ValueError, "frontend.*ended"):
                ci.check()
            self.assertEqual(ci.sleeps, [])

    def test_timeout_is_bounded_for_missing_run_or_running_jobs(self):
        running = green_jobs()
        running[0].update(status="in_progress", conclusion=None)
        for state in [{"runs": []}, snapshot(jobs=running)]:
            ci = FakeCI([state])
            with self.subTest(state=state), self.assertRaisesRegex(TimeoutError, "Timed out after 2.5s"):
                ci.check(timeout=2.5)
            self.assertEqual(ci.sleeps, [1, 1, 0.5])
            self.assertEqual(ci.elapsed, 2.5)

    def test_completed_run_with_missing_compilation_is_rejected(self):
        ci = FakeCI([snapshot(jobs=green_jobs()[:-1], status="completed")])
        with self.assertRaisesRegex(ValueError, "CI finished without successful compilation"):
            ci.check()
        self.assertEqual(ci.sleeps, [])

    def test_wrong_sha_branch_and_event_are_never_used(self):
        for field, value in [("head_sha", "b" * 40), ("head_branch", "other"), ("event", "pull_request")]:
            state = snapshot()
            state["runs"][0][field] = value
            ci = FakeCI([state])
            with self.subTest(field=field), self.assertRaises(TimeoutError):
                ci.check(timeout=1)
            self.assertTrue(all("/workflows/ci.yml/runs?" in call for call in ci.calls))

    def test_latest_matching_run_cannot_fall_back_to_older_success(self):
        failed = green_jobs()
        failed[0]["conclusion"] = "failure"
        state = snapshot(jobs=failed, run_id=2)
        state["runs"].extend(snapshot(run_id=1)["runs"])
        state["jobs"][1] = green_jobs()
        ci = FakeCI([state])
        with self.assertRaisesRegex(ValueError, "frontend.*ended"):
            ci.check()
        self.assertTrue(any("/runs/2/jobs?" in call for call in ci.calls))
        self.assertFalse(any("/runs/1/" in call for call in ci.calls))

    def test_partial_e2e_rerun_retains_successful_compile_results(self):
        jobs = green_jobs() + [{"name": "full-stack-e2e", "run_attempt": 2,
                                "status": "in_progress", "conclusion": None}]
        ci = FakeCI([snapshot(jobs=jobs, attempt=2)])
        self.assertEqual(ci.check(), 1)
        self.assertEqual(ci.sleeps, [])

    def test_newer_compile_attempt_pending_or_failed_overrides_old_success(self):
        for conclusion in ["success", "failure"]:
            new_job = {**green_jobs(2)[0], "status": "queued", "conclusion": None}
            pending = snapshot(jobs=green_jobs() + [new_job], attempt=2)
            complete = snapshot(jobs=green_jobs() + [{**new_job, "status": "completed", "conclusion": conclusion}], attempt=2)
            ci = FakeCI([pending, complete])
            with self.subTest(conclusion=conclusion):
                if conclusion == "success":
                    self.assertEqual(ci.check(), 1)
                else:
                    with self.assertRaisesRegex(ValueError, "frontend.*ended"):
                        ci.check()
                self.assertEqual(ci.sleeps, [1])

    def test_attempt_change_during_job_read_is_rechecked(self):
        first = snapshot(status="completed")
        first["confirmed"] = snapshot(status="queued", attempt=2)["runs"][0]
        pending = green_jobs(2)
        pending[0].update(status="in_progress", conclusion=None)
        ci = FakeCI([first, snapshot(jobs=pending, attempt=2), snapshot(attempt=2)])
        self.assertEqual(ci.check(), 1)
        self.assertEqual(ci.sleeps, [1, 1])

    def test_discovery_rerun_waits_for_replacement_image_matrix(self):
        discovery = next(job for job in green_jobs(2) if job["name"] == "backend-services")
        preparing = {**discovery, "status": "in_progress", "conclusion": None}
        first = snapshot(jobs=green_jobs() + [preparing], attempt=2)
        gap = snapshot(jobs=green_jobs() + [discovery], attempt=2)
        failed = {**discovery, "status": "completed", "conclusion": "failure"}
        replacement = [job for job in green_jobs(2) if job["name"].startswith("images (")]
        ready = snapshot(jobs=green_jobs() + [discovery] + replacement, attempt=2)
        ci = FakeCI([first, gap, ready])
        self.assertEqual(ci.check(), 1)
        self.assertEqual(ci.sleeps, [1, 1])
        ci = FakeCI([snapshot(jobs=green_jobs() + [failed], attempt=2)])
        with self.assertRaisesRegex(ValueError, "backend-services.*ended"):
            ci.check()
        self.assertEqual(ci.sleeps, [])

    def test_failed_previous_attempt_waits_for_replacement_to_appear(self):
        old = green_jobs()
        old[0]["conclusion"] = "failure"
        ci = FakeCI([snapshot(jobs=old, attempt=2), snapshot(attempt=2)])
        self.assertEqual(ci.check(), 1)
        self.assertEqual(ci.sleeps, [1])

    def test_job_pagination_is_complete(self):
        jobs = [{"id": index, "name": f"unrelated {index}"} for index in range(100)] + green_jobs()
        ci = FakeCI([snapshot(jobs=jobs)])
        self.assertEqual(ci.check(), 1)
        self.assertTrue(any("page=2" in call for call in ci.calls))

    def test_ambiguous_jobs_or_wrong_job_revision_fail_closed(self):
        duplicate = green_jobs() + [{**green_jobs()[0], "id": 9999}]
        wrong_sha = green_jobs()
        wrong_sha[0]["head_sha"] = "b" * 40
        for jobs in [duplicate, wrong_sha]:
            ci = FakeCI([snapshot(jobs=jobs)])
            with self.subTest(jobs=jobs), self.assertRaises(ValueError):
                ci.check()
            self.assertEqual(ci.sleeps, [])


if __name__ == "__main__":
    unittest.main()
