# Vanta Desktop help

Start a new chat, describe what you need, and review the result. You do not need
a source checkout or development tools to use the packaged Mac app.

## Install or update the right app

Use the normal **Vanta Desktop** download in the [installation guide](installation.md),
not the retired Iris tester build. Desktop releases use `desktop-v…` tags;
the repository's global “Latest” can instead be a CLI/kernel release.

Quit Vanta before manually replacing it, and keep a rollback copy of the old
app. Open the installed copy from Applications. Do not run two versions against
the same profile or delete your app data to fix an installation.

The 0.1.4 release has [dated release evidence](releases/desktop-v0.1.4.md).
Native update and DMG delivery are separate acceptance steps; a signed ZIP alone
does not prove either. Check that page and the installation guide for current
download and acceptance status.

The terminal `vanta` command is optional and has its own installation/update
path. Running `vanta update` does not replace the installed Desktop app.

## Connect a model and send your first message

Choose a provider in the setup picker. Enter credentials only in Vanta's
provider setup/settings, never in a chat or bug report. Cloud providers may
charge for usage; check your provider account before sending work.

For a local model, choose **Local / custom endpoint**. Start your model server
and make sure a model is installed there. For Ollama, the usual local address is
`http://localhost:11434`. Vanta's app does not need a Python/setup wizard, and
connecting a model does not grant computer-control permissions.

You can choose a provider later. Your draft remains available; sending without
a configured provider reopens setup. After a rejected request, follow the
restoration steps below before sending it yourself.

If the local endpoint is not answering, start that server, check its address
and retry **Connect**. Vanta keeps the entered address. If a cloud provider
rejects authentication, review that provider's credentials/account. Do not keep
resending the same request while its outcome is unclear.

## Recover a retained or blocked request

If Vanta says **“This message was not accepted”** and offers
**Restore without sending**:

1. Keep any new text somewhere safe, then empty the current message box.
2. Click **Restore without sending** and review the recovered text/attachments.
3. Press Send or Enter only when you want to send that request.

Restoring does not send anything. A retained, unresolved request can block a
new send even if the Send button looks available. Resolve the recovery first;
do not delete app data or repeatedly press Send.

If the message instead says an action **may have partially completed** or its
outcome is **unknown**, inspect the conversation and the affected app/site
before deciding what to do. Do not assume it failed or repeat an external write.

When offline, keep the app open if it is still saving an attachment. A local
model can only answer while its server/model is available; cloud models and
web research need their services reachable. A visible draft is not proof that
an external action completed.

## Attach files and images

Use the message box's add/attachment control, or drop a file into the composer.
Wait for loading/saving to finish, review the attachment chips, then send.

Images accept **PNG, JPEG or TIFF**, up to **4 images**, **10 MB per image** and
**20 MB total per message**. These are image limits, not a universal document
upload limit. The selected model must support the requested image task.

An unreadable or corrupt image is not usable just because a placeholder appears.
Remove the failed chip, open or re-export the original image, then attach a
readable copy. Keep your typed message and other valid attachments. TIFF decode
failures are a separate known gap; do not assume every TIFF is readable.

If chat stops responding after an attachment, note the file type/size, whether
the draft survives restart, and the visible error. Report it privately; do not
include the original personal document unless separately requested and approved.

## Check for updates safely

Use **Vanta → Check for Updates…**. An eligible normal Apple Silicon Mac launch
can discover an update; installing requires your explicit confirmation. Finish
or resolve active work before restarting. Updates verify the archive/publisher
and retain an app rollback; that is not a backup of all your personal data.

If asked to open Vanta normally, quit the isolated/development launch and open
the installed app from Applications. Custom profile, project, runtime or kernel
overrides cannot be safely carried through a native restart. Do not remove
that protection or copy credentials/approvals between profiles to bypass it.

If an update outcome is uncertain, inspect the installed version before retrying.
Keep the existing app and rollback until the replacement opens correctly.
Do not reopen Vanta yourself during replacement; the updater relaunches it.
If **Update didn't finish** reports signature verification in an older build,
save your work and install the current normal download manually. Do not disable
macOS verification or delete your profile to get past the error.

## Get help or report a bug

Source candidate update (24 November; not yet in the installed 0.1.4 release):
error cards and failure notices can open the same feedback form. **Add diagnostic
details** adds optional build facts and recent content-free failure codes to
the editable context. Review it before sending. **Save report** saves the exact
preview as local JSON without sending it. **Clear saved failure codes** does
not erase text you already added to a report. Details and verification limits:
[support reporting checkpoint](desktop-support-reporting-2026-11-24.md).

Choose **Help → Vanta Docs** for documentation or **Help → Send feedback…**
for a private bug report or idea. Describe what you expected, what happened and
the shortest steps to reproduce it. Review the exact report before choosing
**Send privately**.

Feedback goes to Vanta's private receiver for Jason, not a public GitHub issue.
Chats, files, screenshots and logs are not automatically collected. Optional
version details appear in the preview. Never paste passwords, API keys or
private documents. If delivery is uncertain, retain/copy the report and follow
the same-report retry option rather than creating duplicates.

For the exact first-launch proof and its limits, see the
[17 November recovery record](desktop-first-launch-recovery-2026-11-17.md).
