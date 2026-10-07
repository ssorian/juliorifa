import test from 'node:test'
import assert from 'node:assert/strict'
import { executeConfirmedJobs, parseJobArguments } from './run-jobs'

test('explicit confirmation flag and legacy alias', () => {
  assert.equal(parseJobArguments(['--all', '--confirm-jobs']).execute, true)
  assert.equal(parseJobArguments(['--all', '--execute']).execute, true)
  assert.equal(parseJobArguments(['--all']).execute, false)
  assert.throws(() => parseJobArguments(['--all', '--unknown']))
})

test('missing confirmation, disabled jobs and unknown flags never load executor', async () => {
  const previous = process.env.JOBS_ENABLED
  let loads = 0
  const load = async () => {
    loads++
    return async () => {
      throw new Error('must not run')
    }
  }
  try {
    process.env.JOBS_ENABLED = 'true'
    await assert.rejects(
      executeConfirmedJobs(['--all'], load),
      /JOBS_EXECUTION_NOT_CONFIRMED/,
    )
    await assert.rejects(
      executeConfirmedJobs(['--all', '--unknown'], load),
      /INVALID_JOB_ARGUMENTS/,
    )
    process.env.JOBS_ENABLED = 'false'
    await assert.rejects(
      executeConfirmedJobs(['--all', '--confirm-jobs'], load),
      /JOBS_NOT_ENABLED/,
    )
    assert.equal(loads, 0)
  } finally {
    if (previous === undefined) delete process.env.JOBS_ENABLED
    else process.env.JOBS_ENABLED = previous
  }
})
