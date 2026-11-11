/**
 * Axil Studio — browser runtime, assembled from the client/* modules into one
 * IIFE that is inlined into the page. Every module shares the IIFE scope.
 */
import { CORE }      from './client/core.js'
import { SHELL }     from './client/shell.js'
import { OVERVIEW }  from './client/overview.js'
import { ENDPOINTS } from './client/endpoints.js'
import { DATABASE }  from './client/database.js'
import { SCHEMA }    from './client/schema.js'
import { SQL }       from './client/sql.js'
import { REALTIME }  from './client/realtime.js'

export function buildClientScript(): string {
  const body = [CORE, SHELL, OVERVIEW, ENDPOINTS, DATABASE, SCHEMA, SQL, REALTIME].join('\n')
  // Views are registered in nav order; boot runs once the DOM is parsed
  return `(function () {\n"use strict";\n${body}\nif (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();\n})();`
}
