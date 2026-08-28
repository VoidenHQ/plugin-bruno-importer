/**
 * Bruno Collection Importer Extension
 *
 * Supports three different Bruno file shapes:
 *
 * 1. A single classic Bruno `.bru` request file (http, graphql, grpc, or
 *    ws) — Bruno's native on-disk format, one request per file. Converts
 *    to exactly one Voiden .void file.
 * 2. A Bruno environment file (`environments/<name>.bru`) — no `meta{}`
 *    block, just `vars{}`/`vars:secret[]`. Converts into Voiden's own
 *    env-public.yaml/env-private.yaml environment tree.
 * 3. A whole OpenCollection YAML/JSON export — the output of Bruno 3.0+'s
 *    "Export Collection" button, a single file bundling an entire
 *    folder/request tree (closer in shape to a Postman/Insomnia export).
 *    Walks the tree, producing one .void file per request plus matching
 *    folders — see src/utils/openCollectionConverter.ts.
 *
 * BrunoImportButton picks which path to run based on which shape the
 * opened tab's content actually matches.
 */

import { PluginContext } from '@voiden/sdk/ui';
import React from 'react';
import { BrunoImportButton } from './components/BrunoImportButton';
import { looksLikeBruRequestFile, looksLikeBruEnvironmentFile } from './utils/types';
import { looksLikeOpenCollection } from './utils/opencollectionTypes';

const brunoImportPlugin = (context: PluginContext) => {
  const showToast = (context as any)?.ui?.showToast as
    | ((message: string, type?: 'info' | 'success' | 'warning' | 'error') => void)
    | undefined;

  return {
    onload: () => {
      context.registerEditorAction({
        id: 'bruno-importer-button',
        component: (props: any) =>
          React.createElement(BrunoImportButton, {
            ...props,
            showToast,
          }),
        predicate: (tab) => {
          const title = tab.title ?? '';
          const c = (tab.content ?? '').slice(0, 65536);

          if (title.endsWith('.bru')) {
            return looksLikeBruRequestFile(c) || looksLikeBruEnvironmentFile(c);
          }
          if (title.endsWith('.yml') || title.endsWith('.yaml') || title.endsWith('.json')) {
            return looksLikeOpenCollection(c);
          }
          return false;
        },
      });
    },
    onunload: () => {},
  };
};

export default brunoImportPlugin;
