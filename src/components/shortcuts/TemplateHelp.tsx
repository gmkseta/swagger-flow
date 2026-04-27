import { useState } from 'preact/hooks';
import { interpolate } from '../../utils/template';

const TEMPLATE_EXAMPLES: { expr: string; desc: string }[] = [
  { expr: '{{step.1.data.id}}', desc: 'Previous step extracted value' },
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
  /** Initial playground content. */
  initialPlayground?: string;
}

export function TemplateHelp({
  stepIndex = 1,
  variant = 'pill',
  initialPlayground = '{{$date(YYYY-MM-DD)}} · {{$uuid}}',
}: Props) {
  const [open, setOpen] = useState(false);
  const [playground, setPlayground] = useState(initialPlayground);

  if (!open) {
    const triggerClass =
      variant === 'compact'
        ? 'text-[10px] text-indigo-500 hover:text-indigo-700'
        : variant === 'header'
        ? 'text-[11px] bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded font-medium border border-indigo-200'
        : 'text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium border border-indigo-200 inline-flex items-center gap-1';
    return (
      <button
        onClick={() => setOpen(true)}
        class={triggerClass}
        title="Show all template variables and live playground"
      >
        <span aria-hidden="true">✨</span> Variables & Playground
      </button>
    );
  }

  // Live preview using a minimal dummy context — real env/step values aren't
  // available here, but generators ($uuid, $date, ...) are fully live.
  let preview = '';
  try {
    preview = interpolate(playground, {
      env: {},
      steps: {
        [stepIndex > 0 ? stepIndex : 1]: { data: { id: '<step-value>' } },
      },
    });
  } catch (e: any) {
    preview = `Error: ${e.message || e}`;
  }

  return (
    <div class="bg-indigo-50 border border-indigo-200 rounded p-2 text-[10px] space-y-2">
      <div class="flex justify-between items-center">
        <span class="font-semibold text-indigo-800">Template Variables</span>
        <button onClick={() => setOpen(false)} class="text-gray-400 hover:text-gray-600">x</button>
      </div>

      <div class="text-[10px] text-indigo-900/80">
        Not JavaScript — a safe MV3-compliant evaluator. Supported: <code>+</code> concat,
        ternary <code>?:</code>, comparisons <code>=== !== &gt; &lt;</code>, string/number literals.
      </div>

      <div>
        <div class="font-semibold text-indigo-800 mb-0.5">Variables & Generators</div>
        <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-indigo-700">
          {TEMPLATE_EXAMPLES.map((e) => (
            <>
              <button
                class="text-left hover:underline"
                title="Click to load in playground"
                onClick={() => setPlayground((prev) => (prev ? prev + ' ' + e.expr : e.expr))}
              >
                {e.expr}
              </button>
              <span class="text-gray-500 font-sans">{e.desc}</span>
            </>
          ))}
        </div>
      </div>

      <div class="border-t border-indigo-200 pt-1">
        <div class="font-semibold text-indigo-800 mb-0.5">Expressions</div>
        <div class="grid grid-cols-1 gap-y-0.5 font-mono text-indigo-700">
          {EXPRESSION_EXAMPLES.map((e) => (
            <div>
              <button
                class="text-left hover:underline"
                onClick={() => setPlayground(e.expr)}
              >
                {e.expr}
              </button>{' '}
              <span class="text-gray-500 font-sans">— {e.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div class="border-t border-indigo-200 pt-1.5">
        <div class="font-semibold text-indigo-800 mb-1">Playground</div>
        <textarea
          value={playground}
          onInput={(e) => setPlayground((e.target as HTMLTextAreaElement).value)}
          class="w-full h-14 font-mono text-[11px] p-1.5 border border-indigo-200 rounded bg-white resize-y"
          spellcheck={false}
        />
        <div class="mt-1 text-[10px] text-indigo-900/80">Preview:</div>
        <pre class="bg-white border border-indigo-100 rounded p-1.5 font-mono text-[11px] whitespace-pre-wrap break-all">
          {preview || <span class="text-gray-400">(empty)</span>}
        </pre>
        <div class="text-[9px] text-gray-500 mt-0.5">
          Generators run live. <code>{`{{env.*}}`}</code> / <code>{`{{step.N.*}}`}</code> use dummy values here;
          real execution fills them in.
        </div>
      </div>
    </div>
  );
}
