#!/usr/bin/env python3
"""Preview or copy legacy citations into document-service without rewriting published records.

Usage: DOCUMENT_MIGRATION_TOKEN=... python3 scripts/migrate_document_references.py --base-url http://localhost
       DOCUMENT_MIGRATION_TOKEN=... python3 scripts/migrate_document_references.py --base-url http://localhost --apply
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def request(base, path, token, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)


def candidates(base, token):
    countries = request(base, "/api/catalog/countries", token)
    seen = set()
    for country in countries:
        detail = request(base, f"/api/catalog/countries/{urllib.parse.quote(country['isoCode'])}", token)
        for constitution in detail.get("constitutions", []):
            constitution_id = constitution["id"]
            versions = request(base, f"/api/catalog/constitutions/{constitution_id}/versions?listing=all", token)
            for version in versions:
                url = version.get("sourceUrl")
                if url and (version["id"], url) not in seen:
                    seen.add((version["id"], url))
                    yield {"targetType": "version", "targetId": version["id"],
                           "title": f"{constitution['title']} — {version['versionLabel']}",
                           "sourceUrl": url, "description": f"Legacy constitution source for version {version['id']}"}
            amendments = request(base, f"/api/amendment/constitutions/{constitution_id}/amendments?status=all", token)
            for amendment in amendments:
                revisions = request(base, f"/api/amendment/amendments/{amendment['id']}/revisions", token)
                tip_id = revisions[-1]["id"] if revisions else None
                for index, legacy in enumerate(amendment.get("documents") or []):
                    raw_url = legacy.get("url") or None
                    parsed = urllib.parse.urlparse(raw_url) if raw_url else None
                    url = raw_url if parsed and parsed.scheme in ("http", "https") and parsed.netloc else None
                    file_id = legacy.get("fileId") or None
                    label = legacy.get("label") or None
                    if not any((raw_url, file_id, label)):
                        continue
                    key = (amendment["id"], raw_url, file_id, label)
                    if key in seen:
                        continue
                    seen.add(key)
                    yield {"targetType": "amendment", "targetId": amendment["id"],
                           "scopeRevisionId": tip_id,
                           "skipReason": "published_revision_is_immutable" if tip_id == amendment.get("publishedRevisionId") else None,
                           "title": label or f"{amendment['title']} document {index + 1}",
                           "sourceUrl": url, "description": "; ".join(filter(None, [
                               f"Legacy archived file ID: {file_id}" if file_id else None,
                               f"Legacy URL: {raw_url}" if raw_url and not url else None,
                           ])) or "Legacy amendment reference"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--apply", action="store_true", help="Create managed documents and pinned links")
    args = parser.parse_args()
    token = os.environ.get("DOCUMENT_MIGRATION_TOKEN")
    if not token:
        parser.error("DOCUMENT_MIGRATION_TOKEN is required")
    base = args.base_url.rstrip("/")
    existing_docs = request(base, "/api/document/documents", token)
    changes = 0
    skipped = 0
    for item in candidates(base, token):
        if item.get("skipReason") or (item["targetType"] == "amendment" and not item.get("scopeRevisionId")):
            skipped += 1
            print(json.dumps({"action": "skip", **item}, ensure_ascii=False))
            continue
        scope_query = f"?scopeRevisionId={item['scopeRevisionId']}" if item.get("scopeRevisionId") else ""
        links = request(base, f"/api/document/links/{item['targetType']}/{item['targetId']}{scope_query}", token)
        matching = next((document for document in existing_docs if
                         document["revision"]["title"] == item["title"] and
                         document["revision"].get("sourceUrl") == item["sourceUrl"] and
                         document["revision"].get("description") == item["description"]), None)
        if matching and any(link["documentId"] == matching["id"] for link in links):
            continue
        changes += 1
        print(json.dumps({"action": "attach" if matching else "create_and_attach", **item}, ensure_ascii=False))
        if not args.apply:
            continue
        if not matching:
            matching = request(base, "/api/document/documents", token, "POST",
                               {key: item[key] for key in ("title", "description", "sourceUrl")})
            existing_docs.append(matching)
        request(base, f"/api/document/links/{item['targetType']}/{item['targetId']}", token, "POST",
                {"documentId": matching["id"], "revisionId": matching["revision"]["id"],
                 "scopeRevisionId": item.get("scopeRevisionId")})
    print(f"{changes} reference(s) {'migrated' if args.apply else 'would be migrated'}; {skipped} published or unscoped amendment reference(s) retained as legacy", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f"Migration stopped: HTTP {error.code} at {error.url}", file=sys.stderr)
        raise SystemExit(1)
