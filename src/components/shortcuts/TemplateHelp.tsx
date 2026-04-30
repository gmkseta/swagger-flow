import { useState, useEffect } from 'preact/hooks';
import { interpolate } from '../../utils/template';

const TEMPLATE_EXAMPLES: { expr: string; desc: string }[] = [
  { expr: '{{step.1.data.id}}', desc: 'Previous step extracted value' },
  { expr: '{{step.1.request.headers.authorization}}', desc: 'Previous step request header' },
  { expr: '{{step.1.response.headers.x-request-id}}', desc: 'Previous step response header' },
  { expr: '{{step.1.request.body.data.id}}', desc: 'Previous step request body value' },
  { expr: '{{env.API_KEY}}', desc: 'Environment variable' },
  { expr: '{{env.BASE_URL}}', desc: 'Env var (any key)' },
  { expr: '{{$uuid}}', desc: 'Random UUID v4' },
  { expr: '{{$randomString(8)}}', desc: 'Random lowercase alphanumeric, length N' },
  { expr: '{{$randomInt(1,100)}}', desc: 'Random integer in [min, max]' },
  { expr: '{{$randomEmail}}', desc: 'Random email address' },
  { expr: '{{$timestamp}}', desc: 'Unix timestamp (seconds)' },
  { expr: '{{$isoTimestamp}}', desc: 'ISO-8601 timestamp' },
  { expr: '{{$date(YYYY-MM-DD)}}', desc: 'Formatted date — tokens: YYYY YY MM DD HH mm ss SSS' },
  { expr: '{{$date(YY MM DD)}}', desc: '2-digit year, spaced' },
  { expr: '{{$date(YYYYMMDDHHmmss)}}', desc: 'Compact datetime' },
];

const EXPRESSION_EXAMPLES: { expr: string; desc: string }[] = [
  { expr: '{{step.1.first + " " + step.1.last}}', desc: 'String concat (+)' },
  { expr: '{{step.1.status === "200" ? "ok" : "fail"}}', desc: 'Ternary' },
  { expr: '{{step.1.count > "10" ? "many" : "few"}}', desc: 'Comparison' },
];

interface Props {
  stepIndex?: number;
  /** Visual style for the trigger button. */
  variant?: 'compact' | 'pill' | 'header';
}

export function TemplateHelp({ stepIndex = 1, variant = 'pill' }: Props) {
  const [open, setOpen] = useState(false);

  const triggerClass =
    variant === 'compact'
      ? 'text-[10px] text-indigo-500 hover:text-indigo-700'
      : variant === 'header'
      ? 'text-[11px] bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded font-medium border border-indigo-200'
      : 'text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium border border-indigo-200 inline-flex items-center gap-1';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        class={triggerClass}
        title="Show all template variables and live playground"
      >
        <span aria-hidden="true">✨</span> Variables & Playground
      </button>
      {open && (
        <TemplateHelpModal stepIndex={stepIndex} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function TemplateHelpModal({
  stepIndex,
  onClose,
}: {
  stepIndex: number;
  onClose: () => void;
}) {
  const [playground, setPlayground] = useState('{{$date(YYYY-MM-DD)}} · {{$uuid}}');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  let preview = '';
  try {
    preview = interpolate(playground, {
      env: {},
      steps: {
        [stepIndex > 0 ? stepIndex : 1]: {
          first: 'Jane',
          last: 'Doe',
          status: 200,
          count: 12,
          data: { id: '<step-value>' },
          request: {
            headers: {
              authorization: 'Bearer <request-token>',
              'x-client-id': 'client-123',
            },
            body: {
              data: { id: '<request-body-id>' },
            },
          },
          response: {
            headers: {
              'x-request-id': 'req-12345',
            },
            body: {
              data: { id: '<response-body-id>' },
            },
          },
        },
      },
    });
  } catch (e: any) {
    preview = `Error: ${e.message || e}`;
  }

  function copyExpr(expr: string) {
    navigator.clipboard.writeText(expr).catch(() => { /* ignore */ });
  }

  return (
    <div
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2"
      onClick={onClose}
    >
      <div
        class="bg-white w-full max-w-md h-[85vh] rounded-lg shadow-xl flex flex-col text-xs overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div class="flex items-center justify-between px-3 py-2 border-b bg-indigo-600 text-white shrink-0">
          <div class="flex items-center gap-1.5">
            <span class="text-base">✨</span>
            <span class="font-semibold">Template Variables & Playground</span>
          </div>
          <button
            onClick={onClose}
            class="bg-white/15 hover:bg-white/30 text-white px-2.5 py-0.5 rounded text-xs font-medium flex items-center gap-1"
            title="Close (Esc)"
            aria-label="Close"
          >
            <span class="text-sm leading-none">×</span>
            <span>Close</span>
          </button>
        </div>

        {/* Sticky playground at top of body */}
        <div class="px-3 py-2 border-b bg-gray-50 space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-semibold text-indigo-800 uppercase tracking-wide">
              Playground
            </label>
            <button
              onClick={() => setPlayground('')}
              class="text-[10px] text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <textarea
            value={playground}
            onInput={(e) => setPlayground((e.target as HTMLTextAreaElement).value)}
            placeholder="Type a template here…"
            class="w-full h-16 font-mono text-[11px] p-1.5 border border-gray-300 rounded bg-white resize-y"
            spellcheck={false}
          />
          <div>
            <div class="text-[10px] text-gray-500 mb-0.5">Preview:</div>
            <pre class="bg-white border border-gray-200 rounded p-1.5 font-mono text-[11px] whitespace-pre-wrap break-all min-h-[26px]">
              {preview || <span class="text-gray-400">(empty)</span>}
            </pre>
          </div>
          <div class="text-[9px] text-gray-500">
            Generators run live. <code>{`{{env.*}}`}</code> / <code>{`{{step.N.*}}`}</code> use dummy request,
            response, and extracted values here.
          </div>
        </div>

        {/* Scrollable reference list */}
        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
          <div>
            <div class="text-[10px] font-semibold text-indigo-800 uppercase tracking-wide mb-1">
              Variables & Generators
            </div>
            <div class="space-y-0.5">
              {TEMPLATE_EXAMPLES.map((e) => (
                <ExampleRow
                  key={e.expr}
                  expr={e.expr}
                  desc={e.desc}
                  onInsert={() => setPlayground((prev) => (prev ? prev + ' ' + e.expr : e.expr))}
                  onCopy={() => copyExpr(e.expr)}
                />
              ))}
            </div>
          </div>

          <div>
            <div class="text-[10px] font-semibold text-indigo-800 uppercase tracking-wide mb-1">
              Expressions
            </div>
            <div class="text-[10px] text-gray-600 mb-1.5">
              Not JS — safe MV3 evaluator. <code>+</code> concat, ternary <code>?:</code>,
              comparisons <code>=== !== &gt; &lt;</code>, string/number literals.
            </div>
            <div class="space-y-0.5">
              {EXPRESSION_EXAMPLES.map((e) => (
                <ExampleRow
                  key={e.expr}
                  expr={e.expr}
                  desc={e.desc}
                  onInsert={() => setPlayground(e.expr)}
                  onCopy={() => copyExpr(e.expr)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExampleRow({
  expr,
  desc,
  onInsert,
  onCopy,
}: {
  expr: string;
  desc: string;
  onInsert: () => void;
  onCopy: () => void;
}) {
  return (
    <div class="group flex items-start gap-1.5 py-0.5 px-1 rounded hover:bg-indigo-50">
      <button
        onClick={onInsert}
        class="font-mono text-[11px] text-indigo-700 hover:underline text-left shrink-0"
        title="Insert into playground"
      >
        {expr}
      </button>
      <span class="text-[10px] text-gray-500 flex-1 leading-tight">{desc}</span>
      <button
        onClick={onCopy}
        class="text-[10px] text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 shrink-0"
        title="Copy"
      >
        copy
      </button>
    </div>
  );
}
