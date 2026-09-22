# Website user stories by user type

These stories describe what people want to do on Constitution Atlas. A person may have several roles; their available actions are the union of those roles. Every signed-in role also has the public browsing stories. **Planned** marks a flow described in the product design that is not fully available in the current website. This is a product story catalog, not a record of implemented or completed work.

## Anonymous visitor

- As a visitor, I want to browse the countries on the home page so that I can find a constitution.
- As a visitor, I want to open a country and see its constitutions and published legal versions so that I can choose the text I need.
- As a visitor, I want to open the latest published version so that I can read the currently presented text.
- As a visitor, I want to select an older legal version so that I can read the text as it stood at that point.
- As a visitor, I want to navigate the table of contents and individual articles so that I can find a provision quickly.
- As a visitor, I want to move to the previous or next article so that I can read in sequence.
- As a visitor, I want to copy or share a permanent link to a version or article so that another reader can find the same text.
- As a visitor, I want to print a version or article so that I can use it offline.
- As a visitor, I want to search constitutional text by keyword so that I can find relevant provisions.
- As a visitor, I want to filter search results by country, version, and effective date so that I can narrow the results.
- As a visitor, I want to open a search result in its original version so that I do not lose its historical context.
- As a visitor, I want to compare two legal versions and show only changed articles so that I can identify additions, removals, and revisions.
- As a visitor, I want to see the history of an article across versions so that I can understand how its text changed.
- As a visitor, I want to view a country's legal timeline and the documents behind each change so that I can understand why a new version exists.
- As a visitor, I want to see source and verification information so that I can judge the provenance of the text.
- As a visitor, I want to read the About, sources, and accessibility information so that I understand the site's scope and how to use it.
- As a visitor with an invitation, I want to accept it and set my password so that I can access my assigned role.
- As a visitor with an account, I want to sign in and complete an authenticator challenge when required so that I can use my permitted features.
- As a visitor who forgot a password, I want to request and complete a password reset so that I can regain access.

## Viewer

- As a viewer, I want to use all public reading, search, timeline, and comparison features while signed in so that I can research without editorial access.
- As a viewer, I want to see my account and assigned role so that I know which access I have.
- As a viewer, I want to change my password so that I can keep my account secure.
- As a viewer, I want to enroll an authenticator and manage recovery codes so that I can protect and recover my account.
- As a viewer, I want to sign out so that I can end my session.
- **Planned:** As a viewer, I want to sign out of my other sessions so that I can revoke access from devices I no longer use.

## Editor

- As an editor, I want to select a constitution and published text to work from so that I edit the intended material.
- As an editor, I want to open a session for the next legal change or a correction to an existing legal version so that the resulting version has the right meaning.
- As an editor, I want to see my sessions and their statuses so that I can resume unfinished work.
- As an editor, I want to filter the article list and see which articles are changed so that I can navigate a large session.
- As an editor, I want to edit an article's title and text and save a draft so that my changes can be reviewed.
- As an editor, I want to discard an unwanted draft so that it does not appear in the proposed version.
- As an editor, I want to edit section titles where the constitution's outline permits them so that the reader's structure stays accurate.
- As an editor, I want to preview my changes against the published text so that I can check their effect before submission.
- As an editor, I want to submit a completed session for review so that another person can approve it.
- As an editor, I want to open an article directly from the public reader for editing so that I can start from a provision I found.
- As an editor, I want to browse the staff snapshot history so that I can distinguish legal versions from later transcription corrections.
- As an editor, I want to draft and revise a legal change record with its title, citation, dates, summary, comment, documents, and affected articles so that the change is documented.
- As an editor, I want to link a change record to source and target versions so that the legal timeline explains the transition.
- As an editor, I want to fill a change table from two versions and then check it so that I can document the actual differences efficiently.
- As an editor, I want to inspect earlier change-record revisions and restore one as a new draft so that I can correct a record without erasing history.
- As an editor, I want to review quotes that became stale after a transcription correction so that the change record can be updated deliberately.
- **Planned:** As an editor, I want to edit every structure allowed by a constitution's configuration so that text is not flattened or lost.

## Reviewer

- As a reviewer, I want to see sessions awaiting review so that I can pick the next submission.
- As a reviewer, I want to open a submitted session and read its proposed text and diff so that I can check accuracy and context.
- As a reviewer, I want to compare the proposed result with its source version so that I can identify unintended changes.
- As a reviewer, I want to approve a satisfactory session so that it can move to publication.
- As a reviewer, I want to browse legal change records and snapshot history while reviewing so that I can check the surrounding evidence.
- As a reviewer, I want my own submitted work to require another person's approval so that review remains independent.

## Publisher

- As a publisher, I want to see approved sessions ready to publish so that I can release reviewed work.
- As a publisher, I want to inspect an approved session and its preview so that I can confirm what will become public.
- As a publisher, I want to publish a legal successor with its change-record details and source document so that readers can trace the legal change.
- As a publisher, I want to publish a transcription correction with an explanation so that the corrected text is available without presenting it as a new law.
- As a publisher, I want to publish a reviewed change record so that it appears on the public timeline.
- As a publisher, I want to withdraw an incorrect change record so that readers do not rely on it.
- As a publisher, I want to confirm my authenticator before sensitive publication actions so that those actions require fresh authentication.
- As a publisher, I want to see whether publication and search indexing succeeded so that I know when readers can find the new text.

## Administrator

- As an administrator, I want to use the editor, reviewer, and publisher workflows when needed so that I can manage the full editorial process.
- As an administrator, I want to invite a person and assign roles so that they receive the right website access.
- As an administrator, I want to see users and their statuses so that I can manage access.
- As an administrator, I want to change a user's roles so that their access matches their responsibilities.
- As an administrator, I want to disable or reactivate a user so that I can control access without deleting the account.
- As an administrator, I want to issue a password reset for a user so that they can regain access.
- As an administrator, I want to create, rotate, and revoke service tokens so that integrations have controlled access.
- As an administrator, I want to create a constitution with its country, title, slug, and outline so that editors can add its text.
- As an administrator, I want to edit a constitution's outline and presentation settings so that its structure appears correctly in the reader and editor.
- As an administrator, I want to import constitution data by pasting or uploading JSON so that a large text can be added efficiently.
- As an administrator, I want to inspect an import job and open its resulting version so that I can verify the imported content.
- As an administrator, I want to inspect API documentation so that I can understand the available integrations.
- **Planned:** As an administrator, I want to verify a version's source from its reader page so that readers can see its trust status.
- **Planned:** As an administrator, I want the settings form to reject a structure the editor cannot handle so that future editing remains possible.

## Shared account and access stories

- As a signed-in user, I want the navigation and page actions to reflect my roles so that I can find the work I am allowed to do.
- As a signed-in user, I want to see a clear access message if I open a restricted page so that I understand why an action is unavailable.
- As a signed-in user, I want to complete a fresh authenticator check when a sensitive action requires it so that I can continue securely.
- As a user with multiple roles, I want one account to show all of my available actions so that I can move between tasks without switching accounts.

## Source notes

Roles and permissions: [editorial roles](editorial-roles.md). Website destinations: [frontend map](CODEMAPS/frontend.md) and [role link trees](design/role-link-trees.md). Version meaning and planned staff flows: [two-axis version design](design/two-axis-versions.md). Stories marked **Planned** need implementation verification before they are treated as available features.
