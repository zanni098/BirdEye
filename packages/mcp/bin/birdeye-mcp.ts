#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BirdEyeStore, Vault } from '@birdeye/core';
import { createMcpServer } from '../src/server.ts';

const server = createMcpServer({ store: new BirdEyeStore(), vault: new Vault() });
await server.connect(new StdioServerTransport());
