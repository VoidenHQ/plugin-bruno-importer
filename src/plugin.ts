/**
 * Bruno Collection Importer Extension
 *
 * Imports a single Bruno (.bru) HTTP request file and converts it to a
 * Voiden .void request file.
 *
 * Bruno stores one request per file natively (unlike a Postman/Insomnia
 * export, which bundles a whole collection into one JSON/YAML file), so
 * this plugin's UX matches that granularity: open a single .bru file as a
 * tab, click Import. There is no folder-tree/collection import here — see
 * this plugin's skill.md for why, and for how to consolidate several
 * imported requests into one multi-section CRUD file afterward.
 */

import { PluginContext } from '@voiden/sdk/ui';
import React from 'react';
import { BrunoImportButton } from './components/BrunoImportButton';
import { looksLikeBruRequestFile } from './utils/types';

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
          if (!title.endsWith('.bru')) return false;

          // meta{}/method-block markers sit near the top of a request file,
          // so a bounded prefix is enough — same approach as the
          // Postman/Insomnia predicates.
          const c = (tab.content ?? '').slice(0, 65536);
          return looksLikeBruRequestFile(c);
        },
      });
    },
    onunload: () => {},
  };
};

export default brunoImportPlugin;
