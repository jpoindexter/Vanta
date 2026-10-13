import {
  commandsCatalogHandler,
  completePath,
  configGet,
  configSet,
  modelOptions,
  setupRuntimeCheck,
  setupStatus
} from './handlers-config'
import { sessionBranch } from './handlers-branch'
import { approvalPending, approvalRespond, promptSubmit, sessionSteer } from './handlers-prompt'
import {
  type Handler,
  sessionArchive,
  sessionClose,
  sessionCreate,
  sessionDelete,
  sessionHistory,
  sessionInterrupt,
  sessionList,
  sessionResume,
  sessionTitle
} from './handlers-session'

/** Hermes RPC method to the Vanta HTTP calls that implement it. Anything not listed is unsupported. */
export const DISPATCH: Readonly<Record<string, Handler>> = {
  'approval.pending': approvalPending,
  'approval.respond': approvalRespond,
  'commands.catalog': commandsCatalogHandler,
  'complete.path': completePath,
  'config.get': configGet,
  'config.set': configSet,
  'model.options': modelOptions,
  'prompt.submit': promptSubmit,
  'session.archive': sessionArchive,
  'session.branch': sessionBranch,
  'session.branch_stored': sessionBranch,
  'session.branch_whole': sessionBranch,
  'session.close': sessionClose,
  'session.create': sessionCreate,
  'session.delete': sessionDelete,
  'session.history': sessionHistory,
  'session.interrupt': sessionInterrupt,
  'session.list': sessionList,
  'session.resume': sessionResume,
  'session.steer': sessionSteer,
  'session.title': sessionTitle,
  'setup.runtime_check': setupRuntimeCheck,
  'setup.status': setupStatus
}

export const IMPLEMENTED_METHODS: readonly string[] = Object.keys(DISPATCH)
