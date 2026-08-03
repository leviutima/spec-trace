#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import pc from 'picocolors'

const verify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Check that every requirement is covered and every test is honest',
  },
  async run() {
    console.log(pc.yellow('spec-trace verify: not implemented yet'))
  },
})

const report = defineCommand({
  meta: {
    name: 'report',
    description: 'Generate an agent-readable coverage report',
  },
  async run() {
    console.log(pc.yellow('spec-trace report: not implemented yet'))
  },
})

const main = defineCommand({
  meta: {
    name: 'spec-trace',
    description: 'The judge that checks whether your tests actually prove the spec',
  },
  subCommands: { verify, report },
})

void runMain(main)
