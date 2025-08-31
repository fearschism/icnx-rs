import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

// Enhanced Python theme with better syntax highlighting colors
export const pythonTheme: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Comments
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    
    // Keywords
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'keyword.def', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'keyword.class', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'keyword.import', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'keyword.from', foreground: 'C586C0', fontStyle: 'bold' },
    
    // Strings
    { token: 'string', foreground: 'CE9178' },
    { token: 'string.double', foreground: 'CE9178' },
    { token: 'string.single', foreground: 'CE9178' },
    { token: 'string.triple', foreground: 'CE9178' },
    
    // Numbers
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'number.float', foreground: 'B5CEA8' },
    { token: 'number.hex', foreground: 'B5CEA8' },
    
    // Functions and classes
    { token: 'function', foreground: 'DCDCAA', fontStyle: 'bold' },
    { token: 'class', foreground: '4EC9B0', fontStyle: 'bold' },
    
    // Variables and identifiers
    { token: 'identifier', foreground: '9CDCFE' },
    { token: 'identifier.function', foreground: 'DCDCAA' },
    { token: 'identifier.class', foreground: '4EC9B0' },
    
    // Operators
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    
    // Special Python tokens
    { token: 'decorator', foreground: 'FFCC00', fontStyle: 'bold' },
    { token: 'self', foreground: '569CD6', fontStyle: 'italic' },
    { token: 'cls', foreground: '569CD6', fontStyle: 'italic' },
    
    // Error and warning highlights
    { token: 'error', foreground: 'F44747', fontStyle: 'underline' },
    { token: 'warning', foreground: 'FF8C00', fontStyle: 'underline' },
  ],
  colors: {
    'editor.background': '#1A0F0D',
    'editor.foreground': '#D4D4D4',
    'editor.lineHighlightBackground': '#22100eAA',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#C6C6C6',
    'editor.selectionBackground': '#A44436AA',
    'editor.selectionHighlightBackground': '#ADD6FF26',
    'editorCursor.foreground': '#B95140',
    'editorWidget.background': '#1A0F0D',
    'editorWidget.border': '#454545',
    'editorSuggestWidget.background': '#1A0F0D',
    'editorSuggestWidget.border': '#22100e',
    'editorSuggestWidget.selectedBackground': '#22100e',
    'editorSuggestWidget.foreground': '#CCCCCC',
    'editorSuggestWidget.selectedForeground': '#FFFFFF',
    'editorHoverWidget.background': '#1A0F0D',
    'editorHoverWidget.border': '#454545',
    'editorError.foreground': '#F44747',
    'editorWarning.foreground': '#FF8C00',
    'editorInfo.foreground': '#3794FF',
    'editorHint.foreground': '#EEEEEEB3',
    
    // Bracket pair colorization
    'editorBracketMatch.background': '#0064001a',
    'editorBracketMatch.border': '#888888',
    
    // Indentation guides
    'editorIndentGuide.background': '#404040',
    'editorIndentGuide.activeBackground': '#707070',
  },
};

// Python-specific completions for ICNX
export const pythonCompletions = (monaco: typeof import('monaco-editor/esm/vs/editor/editor.api')) => [
  {
    label: 'icnx.emit',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'icnx.emit(${1:payload})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Send results back to ICNX\n\nParameters:\n- payload: Dictionary containing results',
    detail: 'ICNX API Function'
  },
  {
    label: 'icnx.get_option',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'icnx.get_option("${1:option_id}", ${2:default_value})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Get script option value\n\nParameters:\n- option_id: ID of the option\n- default_value: Default value if option not found',
    detail: 'ICNX API Function'
  },
  {
    label: 'icnx.fetch',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'icnx.fetch("${1:url}")',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Fetch content from URL\n\nParameters:\n- url: URL to fetch\n\nReturns: HTML content as string',
    detail: 'ICNX API Function'
  },
  {
    label: 'icnx.select',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'icnx.select(${1:html}, "${2:selector}")',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Select elements from HTML using CSS selectors\n\nParameters:\n- html: HTML content\n- selector: CSS selector\n\nReturns: List of selected elements',
    detail: 'ICNX API Function'
  },
  {
    label: 'icnx.base64_encode',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'icnx.base64_encode(${1:data})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Encode data to base64\n\nParameters:\n- data: Data to encode\n\nReturns: Base64 encoded string',
    detail: 'ICNX API Function'
  },
  {
    label: 'icnx.base64_decode',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'icnx.base64_decode("${1:encoded_data}")',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Decode base64 data\n\nParameters:\n- encoded_data: Base64 encoded string\n\nReturns: Decoded data',
    detail: 'ICNX API Function'
  },
  {
    label: '__meta__ template',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: '__meta__ = {\n    "name": "${1:script-name}",\n    "description": "${2:Description}",\n    "version": "1.0.0",\n    "author": "${3:Author}",\n    "options": []\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Script metadata template for ICNX\n\nDefines script name, description, version, author and options',
    detail: 'ICNX Template'
  },
  {
    label: 'onResolve function',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'def onResolve(url, ctx):\n    """Entry point for ICNX script execution"""\n    ${1:# Implementation here}\n    pass',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Entry point function for ICNX scripts\n\nParameters:\n- url: Target URL\n- ctx: Execution context',
    detail: 'ICNX Function Template'
  },
  {
    label: 'option: text',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: '{\n    "id": "${1:option_id}",\n    "type": "text",\n    "label": "${2:Label}",\n    "description": "${3:Description}",\n    "default": "${4:default_value}"\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Text input option definition',
    detail: 'ICNX Option Template'
  },
  {
    label: 'option: number',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: '{\n    "id": "${1:option_id}",\n    "type": "number",\n    "label": "${2:Label}",\n    "description": "${3:Description}",\n    "default": ${4:0},\n    "min": ${5:0},\n    "max": ${6:100}\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Number input option definition',
    detail: 'ICNX Option Template'
  },
  {
    label: 'option: select',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: '{\n    "id": "${1:option_id}",\n    "type": "select",\n    "label": "${2:Label}",\n    "description": "${3:Description}",\n    "default": "${4:option1}",\n    "options": [\n        {"label": "${5:Option 1}", "value": "${6:option1}"},\n        {"label": "${7:Option 2}", "value": "${8:option2}"}\n    ]\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Select dropdown option definition',
    detail: 'ICNX Option Template'
  },
  {
    label: 'option: bool',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: '{\n    "id": "${1:option_id}",\n    "type": "bool",\n    "label": "${2:Label}",\n    "description": "${3:Description}",\n    "default": ${4:false}\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Boolean checkbox option definition',
    detail: 'ICNX Option Template'
  },
  {
    label: 'option: url',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: '{\n    "id": "${1:option_id}",\n    "type": "url",\n    "label": "${2:Label}",\n    "description": "${3:Description}",\n    "default": "${4:https://example.com}",\n    "required": ${5:true}\n}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'URL input option definition',
    detail: 'ICNX Option Template'
  },
  {
    label: 'emit payload template',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'icnx.emit({\n    "dir": "${1:output_directory}",\n    "items": [\n        {\n            "url": "${2:https://example.com/file.jpg}",\n            "filename": "${3:file.jpg}",\n            "title": "${4:File Title}",\n            "type": "${5:image}"\n        }\n    ]\n})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Template for emitting results to ICNX\n\nTypes: image, video, document, audio',
    detail: 'ICNX Payload Template'
  },
];

// Basic Python linting rules
export interface LintRule {
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export const pythonLintRules: LintRule[] = [
  {
    pattern: /^(\s*)def\s+(\w+)\s*\([^)]*\)\s*:\s*$/m,
    message: 'Function definition should have a docstring',
    severity: 'info'
  },
  {
    pattern: /^(\s*)class\s+(\w+).*:\s*$/m,
    message: 'Class definition should have a docstring',
    severity: 'info'
  },
  {
    pattern: /\btrue\b|\bfalse\b|\bnull\b/gi,
    message: 'Use Python boolean values: True, False, None',
    severity: 'warning'
  },
  {
    pattern: /\bprint\s*\(/g,
    message: 'Consider using icnx.emit() instead of print() for output',
    severity: 'info'
  },
  {
    pattern: /__meta__\s*=\s*\{[^}]*"name"\s*:\s*"[^"]*"[^}]*\}/,
    message: 'Script metadata looks good',
    severity: 'info'
  },
  {
    pattern: /def\s+onResolve\s*\(\s*url\s*,\s*ctx\s*\)\s*:/,
    message: 'Entry point function defined correctly',
    severity: 'info'
  },
];

// Python formatting and validation
export function validatePythonCode(code: string): monaco.editor.IMarkerData[] {
  const markers: monaco.editor.IMarkerData[] = [];
  const lines = code.split('\n');
  
  // Check indentation consistency
  let inconsistentIndentation = false;
  let tabsUsed = false;
  let spacesUsed = false;
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // Check for mixed tabs and spaces
    if (line.includes('\t')) tabsUsed = true;
    if (line.match(/^ +/)) spacesUsed = true;
    
    if (tabsUsed && spacesUsed && !inconsistentIndentation) {
      inconsistentIndentation = true;
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: 'Inconsistent use of tabs and spaces for indentation',
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: line.length + 1,
      });
    }
    
    // Check for common Python issues
    if (line.trim().endsWith(':') && lines[index + 1] && lines[index + 1].trim() === '') {
      const nextContentLine = lines.slice(index + 2).find(l => l.trim() !== '');
      if (!nextContentLine || nextContentLine.search(/\S/) <= line.search(/\S/)) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: 'Expected an indented block',
          startLineNumber: lineNumber + 1,
          startColumn: 1,
          endLineNumber: lineNumber + 1,
          endColumn: 1,
        });
      }
    }
    
    // Check for undefined variables (basic check)
    const undefinedVarMatch = line.match(/\b(\w+)\s*=.*\b(\w+)\b/);
    if (undefinedVarMatch && !line.includes('def ') && !line.includes('class ')) {
      const usedVar = undefinedVarMatch[2];
      const builtins = ['True', 'False', 'None', 'len', 'str', 'int', 'float', 'list', 'dict', 'range', 'enumerate', 'icnx'];
      if (!builtins.includes(usedVar) && !code.includes(`${usedVar} =`) && !code.includes(`def ${usedVar}`) && !code.includes(`import ${usedVar}`)) {
        const startCol = line.indexOf(usedVar) + 1;
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `'${usedVar}' might be undefined`,
          startLineNumber: lineNumber,
          startColumn: startCol,
          endLineNumber: lineNumber,
          endColumn: startCol + usedVar.length,
        });
      }
    }
  });
  
  // Apply lint rules
  pythonLintRules.forEach(rule => {
    let match;
    while ((match = rule.pattern.exec(code)) !== null) {
      const lines = code.substring(0, match.index).split('\n');
      const lineNumber = lines.length;
      const column = lines[lines.length - 1].length + 1;
      
      const severity = rule.severity === 'error' ? monaco.MarkerSeverity.Error :
                      rule.severity === 'warning' ? monaco.MarkerSeverity.Warning :
                      monaco.MarkerSeverity.Info;
      
      // Skip positive info messages unless they match specific patterns
      if (rule.severity === 'info' && (rule.message.includes('looks good') || rule.message.includes('correctly'))) {
        if (!match[0]) continue;
      }
      
      markers.push({
        severity,
        message: rule.message,
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + match[0].length,
      });
      
      // Prevent infinite loop
      if (!rule.pattern.global) break;
    }
  });
  
  return markers;
}

// Enhanced Python language configuration
export function configurePythonLanguage(monaco: typeof import('monaco-editor/esm/vs/editor/editor.api')) {
  // Register Python completions
  const completionDisposable = monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', '"', '\'', '/'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      
      return {
        suggestions: pythonCompletions(monaco).map(completion => ({
          ...completion,
          range,
        })),
      };
    },
  });
  
  // Register Python hover provider
  const hoverDisposable = monaco.languages.registerHoverProvider('python', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      
      const icnxFunctions = {
        'emit': 'Send results back to ICNX\n\n**Syntax:** `icnx.emit(payload)`\n\n**Parameters:**\n- `payload`: Dictionary containing results',
        'get_option': 'Get script option value\n\n**Syntax:** `icnx.get_option(option_id, default_value)`\n\n**Parameters:**\n- `option_id`: ID of the option\n- `default_value`: Default value if option not found',
        'fetch': 'Fetch content from URL\n\n**Syntax:** `icnx.fetch(url)`\n\n**Parameters:**\n- `url`: URL to fetch\n\n**Returns:** HTML content as string',
        'select': 'Select elements using CSS selectors\n\n**Syntax:** `icnx.select(html, selector)`\n\n**Parameters:**\n- `html`: HTML content\n- `selector`: CSS selector',
        'base64_encode': 'Encode data to base64\n\n**Syntax:** `icnx.base64_encode(data)`',
        'base64_decode': 'Decode base64 data\n\n**Syntax:** `icnx.base64_decode(encoded_data)`',
      };
      
      const funcDoc = icnxFunctions[word.word as keyof typeof icnxFunctions];
      if (funcDoc) {
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: funcDoc }],
        };
      }
      
      return null;
    },
  });
  
  return () => {
    completionDisposable.dispose();
    hoverDisposable.dispose();
  };
}
