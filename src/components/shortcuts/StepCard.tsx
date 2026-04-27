import { useState } from 'preact/hooks';
import type { ShortcutStep, Endpoint, Extractor, BindingSource } from '../../db';
import { flattenPaths } from '../../utils/jsonpath';
import { TemplateHelp } from './TemplateHelp';

interface Props {
  step: ShortcutStep;
  index: number;
  totalSteps: number;
  canPaste: boolean;
  endpoints: Endpoint[];
  sampleResponse?: any;
  onCopy: () => void;
  onPasteBelow: () => void;
  onUpdate: (step: ShortcutStep) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
}

export function StepCard({
  step,
  index,
  totalSteps,
  canPaste,
  endpoints,
  sampleResponse,
  onCopy,
  onPasteBelow,
  onUpdate,
  onRemove,
  onMove,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  function setTitle(title: string) {
    onUpdate({ ...step, title: title || undefined });
  }

  function setDescription(desc: string) {
    onUpdate({ ...step, description: desc || undefined });
  }

  function selectEndpoint(method: string, path: string, specName?: string) {
    onUpdate({
      ...step,
      endpointMethod: method,
      endpointPath: path,
      endpointSpecName: specName || undefined,
    });
  }

  function setManualEndpoint(method: string, path: string) {
    const matchedEndpoint = endpoints.find(
      (endpoint) => endpoint.method === method && endpoint.path === path,
    );
    onUpdate({
      ...step,
      endpointMethod: method,
      endpointPath: path,
      endpointSpecName: matchedEndpoint?.specName || undefined,
    });
  }

  function setBinding(param: string, binding: BindingSource) {
    onUpdate({
      ...step,
      parameterBindings: { ...step.parameterBindings, [param]: binding },
    });
  }

  function setBodyTemplate(body: string) {
    onUpdate({ ...step, bodyTemplate: body });
  }

  function addExtractor() {
    const ext: Extractor = { name: '', path: '' };
    onUpdate({ ...step, extractors: [...step.extractors, ext] });
  }

  function updateExtractor(i: number, ext: Extractor) {
    const updated = [...step.extractors];
    updated[i] = ext;
    onUpdate({ ...step, extractors: updated });
  }

  function removeExtractor(i: number) {
    onUpdate({ ...step, extractors: step.extractors.filter((_, j) => j !== i) });
  }

  const isSleep = step.stepType === 'sleep';

  const selectedEndpoint = endpoints.find(
    (e) =>
      e.method === step.endpointMethod
      && e.path === step.endpointPath
      && (!step.endpointSpecName || e.specName === step.endpointSpecName),
  );

  return (
    <div class={`bg-white border rounded-lg overflow-hidden ${isSleep ? 'border-amber-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div
        class={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isSleep ? 'bg-amber-50' : 'bg-gray-50'}`}
        onClick={() => setExpanded(!expanded)}
      >
        <span class="text-xs font-bold text-gray-400 w-5">#{index + 1}</span>
        {isSleep ? (
          <>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              SLEEP
            </span>
            <span class="text-xs truncate flex-1 text-amber-700">
              {step.title ? (
                <><span class="font-medium text-amber-800">{step.title}</span> <span class="text-amber-400">·</span> {step.sleepMs || 1000}ms</>
              ) : (
                <>{step.sleepMs || 1000}ms</>
              )}
              {step.description && (
                <span class="text-gray-400 font-sans ml-1.5">— {step.description}</span>
              )}
            </span>
          </>
        ) : step.endpointPath ? (
          <>
            <span class={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${methodColor(step.endpointMethod)}`}>
              {step.endpointMethod}
            </span>
            <span class="text-xs truncate flex-1">
              {step.title ? (
                <><span class="font-medium">{step.title}</span> <span class="text-gray-300">·</span> <span class="font-mono text-gray-400">{step.endpointPath}</span></>
              ) : (
                <span class="font-mono">{step.endpointPath}</span>
              )}
              {step.endpointSpecName && (
                <span class="text-[10px] text-indigo-500 font-medium ml-1.5">[{step.endpointSpecName}]</span>
              )}
              {step.description && (
                <span class="text-gray-400 font-sans ml-1.5">— {step.description}</span>
              )}
            </span>
          </>
        ) : (
          <span class="text-xs text-gray-400 flex-1">Select an endpoint...</span>
        )}
        <div class="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
            class="text-gray-400 hover:text-emerald-600 p-0.5 text-[10px]"
            title="Copy step"
          >
            Copy
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPasteBelow(); }}
            disabled={!canPaste}
            class="text-gray-400 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 text-[10px]"
            title="Paste below"
          >
            Paste
          </button>
          {index > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onMove('up'); }} class="text-gray-400 hover:text-gray-600 p-0.5" title="Move up">↑</button>
          )}
          {index < totalSteps - 1 && (
            <button onClick={(e) => { e.stopPropagation(); onMove('down'); }} class="text-gray-400 hover:text-gray-600 p-0.5" title="Move down">↓</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} class="text-gray-400 hover:text-red-500 p-0.5 ml-1" title="Remove">×</button>
        </div>
      </div>

      {expanded && (
        <div class="px-3 py-2 space-y-3 text-xs">
          {/* Step Title & Description */}
          <input
            type="text"
            value={step.title || ''}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder={isSleep ? "Step title (e.g. 'Wait for processing')" : "Step title (e.g. 'Create user')"}
            class="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-medium focus:ring-1 focus:ring-indigo-400 focus:border-transparent"
          />
          <input
            type="text"
            value={step.description || ''}
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
            placeholder="Description (optional)"
            class="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:ring-1 focus:ring-indigo-400 focus:border-transparent"
          />

          {/* Sleep config */}
          {isSleep ? (
            <div>
              <label class="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Duration (ms)
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={step.sleepMs || 1000}
                  onInput={(e) => onUpdate({ ...step, sleepMs: parseInt((e.target as HTMLInputElement).value) || 1000 })}
                  class="w-28 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono bg-white"
                />
                <div class="flex gap-1">
                  {[500, 1000, 2000, 5000].map((ms) => (
                    <button
                      key={ms}
                      onClick={() => onUpdate({ ...step, sleepMs: ms })}
                      class={`text-[10px] px-1.5 py-0.5 rounded border ${step.sleepMs === ms ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-amber-300'}`}
                    >
                      {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Endpoint Selector (request steps only) */}
          {!isSleep && (<>
          <div>
            <label class="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Endpoint
            </label>
            {endpoints.length > 0 ? (
              <div class="space-y-1.5">
                <select
                  value={step.endpointPath
                    ? JSON.stringify({
                        method: step.endpointMethod,
                        path: step.endpointPath,
                        specName: step.endpointSpecName || '',
                      })
                    : ''}
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (!val || val === '__manual__') return;
                    const parsed = JSON.parse(val) as { method: string; path: string; specName?: string };
                    selectEndpoint(parsed.method, parsed.path, parsed.specName);
                  }}
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">Select endpoint from spec...</option>
                  {endpoints.map((ep) => (
                    <option
                      key={`${ep.specName || ''}:${ep.method}:${ep.path}`}
                      value={JSON.stringify({ method: ep.method, path: ep.path, specName: ep.specName || '' })}
                    >
                      {ep.specName ? `[${ep.specName}] ` : ''}{ep.method} {ep.path} {ep.summary ? `- ${ep.summary}` : ''}
                    </option>
                  ))}
                  {step.endpointPath && !selectedEndpoint && (
                    <option value={JSON.stringify({
                      method: step.endpointMethod,
                      path: step.endpointPath,
                      specName: step.endpointSpecName || '',
                    })}>
                      {step.endpointMethod} {step.endpointPath} (custom)
                    </option>
                  )}
                </select>
                <div class="flex items-center gap-1.5">
                  <select
                    value={step.endpointMethod}
                    onChange={(e) => setManualEndpoint((e.target as HTMLSelectElement).value, step.endpointPath)}
                    class="w-20 border border-gray-300 rounded px-1.5 py-1.5 text-xs bg-white font-mono"
                  >
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={step.endpointPath}
                    onInput={(e) => setManualEndpoint(step.endpointMethod, (e.target as HTMLInputElement).value)}
                    placeholder="/api/v1/resource"
                    class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono bg-white"
                  />
                </div>
                <div class="text-[10px] text-gray-400">
                  Select from spec, then adjust the path directly if needed.
                </div>
              </div>
            ) : (
              <div class="flex gap-1.5">
                <select
                  value={step.endpointMethod}
                  onChange={(e) => setManualEndpoint((e.target as HTMLSelectElement).value, step.endpointPath)}
                  class="w-20 border border-gray-300 rounded px-1.5 py-1.5 text-xs bg-white font-mono"
                >
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={step.endpointPath}
                  onInput={(e) => setManualEndpoint(step.endpointMethod, (e.target as HTMLInputElement).value)}
                  placeholder="/api/v1/resource"
                  class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono bg-white"
                />
              </div>
            )}
          </div>

          {/* Parameters */}
          {selectedEndpoint && selectedEndpoint.parameters.length > 0 && (
            <div>
              <label class="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Parameters
              </label>
              <div class="space-y-1.5">
                {selectedEndpoint.parameters.map((param) => (
                  <div key={param.name} class="flex items-center gap-1.5">
                    <span class={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${
                      param.in === 'header' ? 'bg-purple-100 text-purple-700' :
                      param.in === 'query' ? 'bg-cyan-100 text-cyan-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {param.in}
                    </span>
                    <span class="w-20 truncate font-mono text-gray-600" title={param.description}>
                      {param.name}
                      {param.required && <span class="text-red-400">*</span>}
                    </span>
                    <select
                      value={step.parameterBindings[param.name]?.type || 'literal'}
                      onChange={(e) => {
                        const type = (e.target as HTMLSelectElement).value as BindingSource['type'];
                        setBinding(param.name, {
                          type,
                          value: step.parameterBindings[param.name]?.value || '',
                          in: param.in,
                        });
                      }}
                      class="border border-gray-200 rounded px-1 py-1 text-[10px] w-16 bg-white"
                    >
                      <option value="literal">Value</option>
                      <option value="env">Env</option>
                      <option value="step_output">Step</option>
                      <option value="generator">Gen</option>
                    </select>
                    <input
                      type="text"
                      value={step.parameterBindings[param.name]?.value || ''}
                      onInput={(e) =>
                        setBinding(param.name, {
                          type: step.parameterBindings[param.name]?.type || 'literal',
                          value: (e.target as HTMLInputElement).value,
                          in: param.in,
                        })
                      }
                      placeholder={
                        step.parameterBindings[param.name]?.type === 'step_output'
                          ? 'step.1.data.id'
                          : step.parameterBindings[param.name]?.type === 'env'
                            ? 'VAR_NAME'
                            : step.parameterBindings[param.name]?.type === 'generator'
                              ? '$uuid'
                              : 'value'
                      }
                      class="flex-1 border border-gray-200 rounded px-2 py-1 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Headers */}
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                Custom Headers
              </label>
              <button
                onClick={() => onUpdate({ ...step, headerOverrides: { ...step.headerOverrides, '': '' } })}
                class="text-indigo-600 hover:text-indigo-800 text-[10px]"
              >
                + Add
              </button>
            </div>
            {step.headerOverrides && Object.entries(step.headerOverrides).map(([key, val], hi) => (
              <div key={hi} class="flex items-center gap-1.5 mb-1">
                <input
                  type="text"
                  value={key}
                  onInput={(e) => {
                    const newKey = (e.target as HTMLInputElement).value;
                    const entries = Object.entries(step.headerOverrides!);
                    entries[hi] = [newKey, val];
                    onUpdate({ ...step, headerOverrides: Object.fromEntries(entries) });
                  }}
                  placeholder="Header-Name"
                  class="w-32 border border-gray-200 rounded px-2 py-1 font-mono text-[11px]"
                />
                <span class="text-gray-400">:</span>
                <input
                  type="text"
                  value={val}
                  onInput={(e) => {
                    const newVal = (e.target as HTMLInputElement).value;
                    const updated = { ...step.headerOverrides, [key]: newVal };
                    onUpdate({ ...step, headerOverrides: updated });
                  }}
                  placeholder="value or {{env.VAR}}"
                  class="flex-1 border border-gray-200 rounded px-2 py-1 font-mono text-[11px]"
                />
                <button
                  onClick={() => {
                    const updated = { ...step.headerOverrides };
                    const entries = Object.entries(updated);
                    entries.splice(hi, 1);
                    onUpdate({ ...step, headerOverrides: entries.length > 0 ? Object.fromEntries(entries) : undefined });
                  }}
                  class="text-gray-400 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Request Body */}
          {(selectedEndpoint?.requestBody || step.bodyTemplate || step.endpointMethod === 'POST' || step.endpointMethod === 'PUT' || step.endpointMethod === 'PATCH') && (
            <div>
              <label class="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Body Template (JSON with {`{{variables}}`})
              </label>
              <textarea
                value={step.bodyTemplate || ''}
                onInput={(e) => setBodyTemplate((e.target as HTMLTextAreaElement).value)}
                placeholder={'{\n  "name": "{{$randomString(8)}}",\n  "email": "{{$randomEmail}}",\n  "parentId": "{{step.1.data.id}}"\n}'}
                class="w-full h-24 font-mono text-[11px] p-2 border border-gray-200 rounded bg-gray-50 resize-y"
                spellcheck={false}
              />
              <TemplateHelp stepIndex={index} />
            </div>
          )}

          {/* Extractors */}
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                Extract from Response
              </label>
              <button
                onClick={addExtractor}
                class="text-indigo-600 hover:text-indigo-800 text-[10px]"
              >
                + Add
              </button>
            </div>
            {step.extractors.map((ext, i) => (
              <div key={i} class="flex items-center gap-1.5 mb-1">
                <input
                  type="text"
                  value={ext.name}
                  onInput={(e) =>
                    updateExtractor(i, { ...ext, name: (e.target as HTMLInputElement).value })
                  }
                  placeholder="varName"
                  class="w-24 border border-gray-200 rounded px-2 py-1 font-mono"
                />
                <span class="text-gray-400">←</span>
                <input
                  type="text"
                  value={ext.path}
                  onInput={(e) =>
                    updateExtractor(i, { ...ext, path: (e.target as HTMLInputElement).value })
                  }
                  placeholder="data.id"
                  class="flex-1 border border-gray-200 rounded px-2 py-1 font-mono"
                />
                <button
                  onClick={() => removeExtractor(i)}
                  class="text-gray-400 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
            {step.extractors.length === 0 && !sampleResponse && (
              <div class="text-[10px] text-gray-400 bg-gray-50 rounded p-2">
                <p class="mb-1">Extract values from the response to use in later steps.</p>
                <p class="font-mono text-gray-500">
                  Examples: <span class="text-indigo-500">token</span> &#8592; data.accessToken &nbsp;|&nbsp;
                  <span class="text-indigo-500">userId</span> &#8592; data.id &nbsp;|&nbsp;
                  <span class="text-indigo-500">items</span> &#8592; data.items[0].name
                </p>
              </div>
            )}
            {sampleResponse && (
              <ResponsePathSuggestions
                response={sampleResponse}
                existingPaths={step.extractors.map((e) => e.path)}
                onAdd={(path, name) => {
                  onUpdate({ ...step, extractors: [...step.extractors, { name, path }] });
                }}
              />
            )}
          </div>

          {/* Retry Config */}
          <div>
            <label class="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Retry on Failure
            </label>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-gray-500">Max</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={step.maxRetries || 0}
                  onInput={(e) => onUpdate({ ...step, maxRetries: parseInt((e.target as HTMLInputElement).value) || 0 })}
                  class="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs font-mono text-center bg-white"
                />
                <span class="text-[10px] text-gray-500">times</span>
              </div>
              {(step.maxRetries || 0) > 0 && (
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-gray-500">delay</span>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    value={step.retryDelayMs || 1000}
                    onInput={(e) => onUpdate({ ...step, retryDelayMs: parseInt((e.target as HTMLInputElement).value) || 1000 })}
                    class="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs font-mono text-center bg-white"
                  />
                  <span class="text-[10px] text-gray-500">ms</span>
                </div>
              )}
            </div>
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}

function ResponsePathSuggestions({ response, existingPaths, onAdd }: {
  response: any;
  existingPaths: string[];
  onAdd: (path: string, name: string) => void;
}) {
  const [show, setShow] = useState(false);
  const paths = flattenPaths(response);
  const available = paths.filter((p) => !existingPaths.includes(p.path));

  if (available.length === 0) return null;

  function guessName(path: string): string {
    // Use last segment as name: "data.user.id" → "id", "items[0].name" → "name"
    const last = path.replace(/\[\d+\]/g, '').split('.').pop() || path;
    return last;
  }

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        class="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
      >
        <span>📋</span> Show response paths ({available.length} fields from history)
      </button>
    );
  }

  return (
    <div class="bg-indigo-50 border border-indigo-200 rounded p-2 text-[10px]">
      <div class="flex justify-between items-center mb-1.5">
        <span class="font-semibold text-indigo-800">Response Fields (from history)</span>
        <button onClick={() => setShow(false)} class="text-gray-400 hover:text-gray-600">x</button>
      </div>
      <div class="max-h-36 overflow-y-auto space-y-0.5">
        {available.map((item) => (
          <div
            key={item.path}
            class="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-indigo-100 cursor-pointer group"
            onClick={() => onAdd(item.path, guessName(item.path))}
          >
            <span class="text-indigo-400 opacity-0 group-hover:opacity-100">+</span>
            <span class="font-mono text-indigo-700 flex-1 truncate">{item.path}</span>
            <span class="text-gray-400 truncate max-w-[120px]">
              {typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'bg-blue-100 text-blue-700';
    case 'POST': return 'bg-green-100 text-green-700';
    case 'PUT': return 'bg-amber-100 text-amber-700';
    case 'PATCH': return 'bg-orange-100 text-orange-700';
    case 'DELETE': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}
