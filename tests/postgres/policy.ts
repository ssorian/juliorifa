export type ExecutionOptions = {
  allowDevelopmentEventTriggers: boolean
  expectedEventTriggers: number
}
export const DEFAULT_OPTIONS: ExecutionOptions = Object.freeze({ allowDevelopmentEventTriggers: false, expectedEventTriggers: 0 })

export function assertEventTriggerPolicy(rows: readonly { count: unknown }[], options: ExecutionOptions) {
  const expected = options.allowDevelopmentEventTriggers === true ? 6 : 0
  if (options.expectedEventTriggers !== expected || rows.length !== 1 || rows[0].count !== expected) throw new Error('EVENT_TRIGGER_POLICY')
}

const STAGES = new Set(['tools', 'migration-surface', 'connect', 'event-trigger-policy', 'schema-create', 'migrations', 'connections', 'scenarios', 'snapshot', 'dump', 'restore-drop', 'restore', 'restore-verify', 'cleanup', 'closed'])
export function stageMessage(stage: string): string | null {
  if (STAGES.has(stage)) return `STAGE: ${stage}`
  const failed = stage.startsWith('failed:') ? stage.slice(7) : ''
  return STAGES.has(failed) ? `ERROR: PostgreSQL stage failed: ${failed}` : null
}
export type StageReporter = (stage: string) => void
export type Executor = (url: string, options: ExecutionOptions, report: StageReporter) => Promise<void>

// Explicit value forwarding: no process-global exception or environment flag.
export function dispatchExecution(execute: Executor, url: string, options: ExecutionOptions, report: StageReporter) {
  return execute(url, { ...options }, report)
}
