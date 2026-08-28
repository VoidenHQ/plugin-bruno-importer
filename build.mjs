#!/usr/bin/env node
import { build } from 'vite'
import { readFileSync, existsSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id
const entry = existsSync('./src/plugin.tsx') ? './src/plugin.tsx'
  : existsSync('./src/plugin.ts') ? './src/plugin.ts'
  : existsSync('./src/index.tsx') ? './src/index.tsx'
  : './src/index.ts'

// Packages provided by the host app at runtime via window.__voiden_shims__
const STATIC_SHIMS = {
  'react': `const _s=window.__voiden_shims__['react'];export default _s;export const {useState,useEffect,useCallback,useMemo,useRef,useContext,createContext,forwardRef,memo,Fragment,createElement,cloneElement,Children,StrictMode,Suspense,lazy,isValidElement,Component,PureComponent,createRef,startTransition,useReducer,useLayoutEffect,useImperativeHandle,useDebugValue,useTransition,useDeferredValue,useId}=_s;`,
  // In Vite dev mode the host may expose jsxDEV instead of jsx — fall back gracefully.
  'react/jsx-runtime': `const _s=window.__voiden_shims__?.['react/jsx-runtime']??{};const _r=window.__voiden_shims__?.['react']??{};export const jsx=_s.jsx??_s.jsxDEV??_r.createElement;export const jsxs=_s.jsxs??_s.jsxDEV??_r.createElement;export const Fragment=_s.Fragment??_r.Fragment;`,
  'react-dom': `const _s=window.__voiden_shims__['react-dom'];export default _s;export const {createPortal,flushSync,render,unmountComponentAtNode}=_s;`,
  'react-dom/client': `const _s=window.__voiden_shims__['react-dom/client'];export default _s;export const {createRoot,hydrateRoot}=_s;`,
  '@tanstack/react-query': `const _s=window.__voiden_shims__['@tanstack/react-query'];export default _s;export const {useQuery,useMutation,useQueryClient,useInfiniteQuery,QueryClient,QueryClientProvider,QueryCache,MutationCache,useIsFetching,useIsMutating,useSuspenseQuery,useSuspenseInfiniteQuery,useSuspenseQueries,useQueries,HydrationBoundary,dehydrate,hydrate,focusManager,onlineManager,replaceEqualDeep,hashKey}=_s;`,
  '@tiptap/react': `const _s=window.__voiden_shims__['@tiptap/react'];export default _s;export const {ReactNodeViewRenderer,NodeViewWrapper,NodeViewContent,useEditor,EditorContent,ReactRenderer,FloatingMenu,BubbleMenu,useReactNodeView,useCurrentEditor}=_s;`,
  '@codemirror/state': `const _s=window.__voiden_shims__['@codemirror/state'];export default _s;export const {Extension,RangeSetBuilder,StateField,EditorState,Prec,Annotation,AnnotationType,ChangeDesc,ChangeSet,Compartment,EditorSelection,Facet,Line,MapMode,Range,RangeSet,RangeValue,SelectionRange,StateEffect,StateEffectType,Text,Transaction,combineConfig,countColumn,findClusterBreak,findColumn}=_s;`,
  '@codemirror/view': `const _s=window.__voiden_shims__['@codemirror/view'];export default _s;export const {keymap,EditorView,Decoration,DecorationSet,WidgetType,ViewPlugin,ViewUpdate,MatchDecorator,GutterMarker,drawSelection,dropCursor,highlightActiveLine,highlightSpecialChars,lineNumbers,rectangularSelection,scrollPastEnd}=_s;`,
  '@codemirror/autocomplete': `const _s=window.__voiden_shims__['@codemirror/autocomplete'];export default _s;export const {CompletionContext,CompletionResult,autocompletion,completeAnyWord,closeBrackets,closeBracketsKeymap,completionKeymap,ifIn,ifNotIn,snippetCompletion}=_s;`,
  '@tiptap/core': `const _s=window.__voiden_shims__['@tiptap/core']||{};export default _s;export const {Editor,Extension,Node,NodeViewProps,Range,JSONContent,generateJSON,mergeAttributes,getSchema}=_s;`,
  '@tiptap/pm/model': `const _s=window.__voiden_shims__['@tiptap/pm/model']||{};export default _s;export const {DOMParser,Fragment,Node,Slice}=_s;`,
  '@tiptap/pm/state': `const _s=window.__voiden_shims__['@tiptap/pm/state']||{};export default _s;export const {EditorState,Plugin,PluginKey}=_s;`,
  '@tiptap/pm/tables': `const _s=window.__voiden_shims__['@tiptap/pm/tables']||{};export default _s;export const {CellSelection}=_s;`,
  '@tiptap/pm/view': `const _s=window.__voiden_shims__['@tiptap/pm/view']||{};export default _s;export const {EditorView}=_s;`,
  '@tiptap/suggestion': `const _s=window.__voiden_shims__['@tiptap/suggestion']||{};export default _s;`,
  'lucide-react': `const _s=window.__voiden_shims__['lucide-react']||{};export default _s;export const {AlertCircle,ArrowDown,ArrowLeft,ArrowRight,ArrowUp,BookOpen,Check,CheckCheck,ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,Circle,CircleAlert,CircleX,Clock,Copy,CornerDownLeft,Download,ExternalLink,Eye,FileText,Folder,FolderOpen,History,Info,Link,Loader,Loader2,Play,Plus,Radio,Search,Sparkles,Trash2,X,XCircle}=_s;`,
  'zustand': `const _s=window.__voiden_shims__['zustand']||{};export default _s;export const {create}=_s;`,
  '@voiden/sdk': `const _s=window.__voiden_shims__['@voiden/sdk']||{};export default _s;export const {PipelineStage,PluginContext,RequestCompilationContext,SlashCommandGroup,UIExtension}=_s;`,
  '@voiden/sdk/shared': `const _s=window.__voiden_shims__['@voiden/sdk/shared']||{};export default _s;export const {Request,RequestParam,parseCookies}=_s;`,
  'tippy.js': `const _s=window.__voiden_shims__['tippy.js']||{};export default _s;`,
  'react-markdown': `const _s=window.__voiden_shims__['react-markdown']||{};export default _s?.default??_s;`,
  'remark-gfm': `const _s=window.__voiden_shims__['remark-gfm']||{};export default _s?.default??_s;`,
  'buffer': `export const Buffer=globalThis.Buffer;export default{Buffer:globalThis.Buffer};`,
}

// Host app module exports — resolved to window.__voiden_shims__ at runtime
const CORE_EXPORTS = {
  '@voiden/sdk/ui': [
    'PluginContext','CorePluginContext','Plugin','SlashCommand','SlashCommandGroup',
    'Tab','EditorAction','StatusBarItem','PluginHelpers',
    'BlockPasteHandler','BlockExtension','PatternHandler',
    'PluginCommand','PluginTopBarItem','PluginContextMenuItem',
    'PluginFS','PluginVault','PluginSettings','PluginSettingsSection',
    'PluginEventCallback','PluginEvents',
  ],
  '@/core/file-system/hooks/useFileSystem': ['prosemirrorToMarkdown'],
  '@/core/editors/voiden/extensions': ['voidenExtensions'],
  '@/core/editors/voiden/VoidenEditor': ['useEditorStore','useVoidenEditorStore','proseClasses'],
  '@/core/editors/voiden/utils/expandLinkedBlocks': ['expandLinkedBlocksInDoc'],
  '@/core/editors/voiden/markdownConverter': ['parseMarkdown'],
  '@/core/request-engine/getRequestFromJson': ['getTable','parseAuthNode','buildHeadersWithCookies','findNode','findNodes','createNewRequestObject','getRequest'],
  '@/core/request-engine/stores/responseStore': ['useResponseStore'],
  '@/core/request-engine/requestOrchestrator': ['requestOrchestrator'],
  '@/core/request-engine/runtimeVariables': ['replaceProcessVariablesInText'],
  '@/core/request-engine/pipeline': ['hookRegistry','PipelineStage'],
  '@/core/history/adapterRegistry': ['historyAdapterRegistry'],
  '@/core/stores/panelStore': ['usePanelStore'],
  '@/core/stores/responsePanelPosition': ['getResponsePanelPosition'],
  '@/core/environment/hooks': ['useActiveEnvironment','useEnvironments'],
  '@/plugins': ['useEditorEnhancementStore','usePluginStore','emitPluginEvent','getContextMenuItems'],
  '@/main': ['getQueryClient'],
}

function shimPlugin() {
  return {
    name: 'voiden-shims',
    enforce: 'pre',
    resolveId(id) {
      if (id in STATIC_SHIMS) return { id: `\0shim:${id}`, syntheticNamedExports: 'default' }
      if (id in CORE_EXPORTS) return `\0shim:${id}`
      return null
    },
    load(id) {
      if (!id.startsWith('\0shim:')) return null
      const mod = id.slice('\0shim:'.length)
      if (mod in STATIC_SHIMS) return STATIC_SHIMS[mod]
      const exports = CORE_EXPORTS[mod] || []
      const key = JSON.stringify(mod)
      const named = exports.map(n => `export const ${n}=_s.${n};`).join('\n')
      return `const _s=(window.__voiden_shims__||{})[${key}]||{};export default _s;\n${named}`
    },
    renderChunk(code) {
      const caps = {}
      if (/registerVoidenExtension/.test(code)) {
        const owns = []
        const re = /\.create\(\s*\{[^}]*?name:\s*["']([^"']+)["']/g
        let m
        while ((m = re.exec(code)) !== null) {
          if (!owns.includes(m[1])) owns.push(m[1])
        }
        caps.blocks = owns.length ? { owns } : {}
      }
      if (/addVoidenSlashGroup|addVoidenSlashCommand/.test(code)) caps.slashCommands = {}
      if (/addHook\b/.test(code)) caps.requestPipeline = {}
      if (/registerContextMenu/.test(code)) caps.contextMenus = {}
      if (/registerTopBarItem/.test(code)) caps.topBar = {}
      if (/registerSidebarTab/.test(code)) caps.sidebar = {}
      if (/registerCommand\b/.test(code)) caps.commandPalette = {}
      if (/registerHelpCommand/.test(code)) caps.help = {}
      const finalManifest = { ...manifest, capabilities: { ...manifest.capabilities, ...caps } }
      const mfStr = JSON.stringify(finalManifest)
      return {
        code: `globalThis["__voiden_bundle_version__"]=2;\nexport const __voiden_bundle_version__=2;\nexport const __voiden_manifest__=${mfStr};\n${code}`,
        map: null,
      }
    },
  }
}

await build({
  configFile: false,
  plugins: [
    shimPlugin(),
    { name: 'skip-css', resolveId(id) { if (id.endsWith('.css')) return '\0empty' }, load(id) { if (id === '\0empty') return 'export default {}' } },
    { name: 'node-buffer', enforce: 'pre', resolveId(id) { if (id === 'buffer') return '\0buf' }, load(id) { if (id === '\0buf') return 'export const Buffer=globalThis.Buffer;export default{Buffer:globalThis.Buffer}' } },
  ],
  esbuild: { jsx: 'automatic' },
  build: {
    lib: { entry, formats: ['es'], fileName: () => `${pluginId}.js` },
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    rollupOptions: {
      onwarn(w, warn) { if (w.code === 'MODULE_LEVEL_DIRECTIVE' || w.code === 'UNRESOLVED_IMPORT') return; warn(w) },
      output: { inlineDynamicImports: true },
    },
  },
  logLevel: 'info',
})
