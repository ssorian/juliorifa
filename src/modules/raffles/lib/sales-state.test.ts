import test from 'node:test'
import assert from 'node:assert/strict'
import { salesState } from './sales-state'

test('server closure takes precedence over global exhaustion', () => {
  assert.equal(salesState({ isSuccess:true, data:{salesOpen:false,available:0} }), 'closed')
  assert.equal(salesState({ isSuccess:true, data:{salesOpen:true,available:0} }), 'sold-out')
  assert.equal(salesState({ isSuccess:true, data:{salesOpen:true,available:0} }, {isSuccess:true,data:{salesOpen:false}}), 'closed')
})
test('unknown/error reads and local empty pages or exclusions cannot imply exhaustion', () => {
  assert.equal(salesState({isSuccess:false}), null)
  assert.equal(salesState({isSuccess:false,data:{salesOpen:false,available:0}}), null)
  assert.equal(salesState({isSuccess:true,data:{salesOpen:true,available:6}}, {isSuccess:true,data:{salesOpen:true}}), null)
})
