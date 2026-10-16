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
import { connectorsAccounts, connectorsCatalog, connectorsList, connectorsPolicyGet, mcpServersList, mcpServersStatus } from './handlers-connectors'
import { profilesList } from './handlers-profiles'
import { projectsProjectSessions, projectsTree } from './handlers-project-tree'
import { projectsCreate, projectsDelete, projectsList, projectsSetActive, projectsUpdate } from './handlers-projects'
import { approvalPending, approvalRespond, promptSubmit, sessionSteer } from './handlers-prompt'
import { queueAction, queueEnqueue, queueList, queueRun } from './handlers-queue'
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

/** Vanta RPC method to the Vanta HTTP calls that implement it. Anything not listed is unsupported. */
export const DISPATCH: Readonly<Record<string, Handler>> = {
  'approval.pending': approvalPending,
  'approval.respond': approvalRespond,
  'commands.catalog': commandsCatalogHandler,
  'complete.path': completePath,
  'config.get': configGet,
  'connectors.accounts': connectorsAccounts,
  'connectors.catalog': connectorsCatalog,
  'connectors.list': connectorsList,
  'connectors.policy.get': connectorsPolicyGet,
  'config.set': configSet,
  'mcp.servers.list': mcpServersList,
  'mcp.servers.status': mcpServersStatus,
  'model.options': modelOptions,
  'profiles.list': profilesList,
  'projects.create': projectsCreate,
  'projects.delete': projectsDelete,
  'projects.list': projectsList,
  'projects.project_sessions': projectsProjectSessions,
  'projects.set_active': projectsSetActive,
  'projects.tree': projectsTree,
  'projects.update': projectsUpdate,
  'prompt.submit': promptSubmit,
  'queue.action': queueAction,
  'queue.enqueue': queueEnqueue,
  'queue.list': queueList,
  'queue.run': queueRun,
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
