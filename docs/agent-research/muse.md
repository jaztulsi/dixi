# Meta Muse for Mac: the agent pathway

Sources:
- Meta help page "How Muse works with files and apps in your Mac" (meta.com/help);
- MarkTechPost, 19 Sep 2026;
- Enterprise DNA;
- AI Weekly.

Meta has not published the internals. Coverage conflicts on where the agent runs, and that is flagged below.

## What is known
- **Launch and scope:** shipped 17 Sep 2026. At launch it acted in native apps (Files, Mail, Messages, Calendar, Notes). After Connect (24 Sep) it can operate *any* app, with permission, not only the apps that have a connector.
- **The ladder is the same shape as Cowork's:** connectors and native-app integrations first, general app control (computer use) for everything else.
- **Permissions are the Mac's own:** Full Disk Access and Notifications, granted and revoked in System Settings. Control of any app presumably also needs Accessibility and Screen Recording, though the sources don't say so.
- **Approval:** it asks before **deleting or sending**. That is the same rule as Dixi's `heldBack` / `allowSend` / `allowDelete` (everywhere.js:66-71).
- **Where it runs (sources conflict):**
  - Some reports say actions run on a dedicated **cloud Secure VM** per user.
  - Meta's help page describes local file access.
  - A likely reading (inference, not confirmed): the model and loop run in Meta's cloud, and a local Mac app carries out the actions.
- **Guardrails:**
  - **Sentinel**, a separate component, controls connector actions and outbound network access.
  - Sign-ins sit in a credential store the agent cannot read.

## What Dixi takes from it
1. A small **policy layer outside the model**, like Sentinel, that sees every tool call before it runs. In the Agent SDK this is `canUseTool` plus a `PreToolUse` hook.
2. **Credentials are never in the model's context.** Tools sign in; the model only sees results.
3. **Native-app integrations before clicking.** Dixi already has these in `mac.js`, `desktop.js`, `files.js` and `calendar.js` (JXA, Spotlight, EventKit-style).
4. **Ask only before send, delete or spend.** Everything else just runs, with Undo.

## What is not knowable
Muse's model, its prompts, its loop code and its latency are not published. None of this plan depends on them.
