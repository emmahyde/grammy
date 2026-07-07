import CodeMirror from '@uiw/react-codemirror'

interface Props {
  value: string
  onChange: (text: string) => void
  parseError: string | null
}

export function CodePane({ value, onChange, parseError }: Props) {
  return (
    <div className="code-pane">
      <CodeMirror
        value={value}
        onChange={onChange}
        theme="dark"
        height="100%"
        style={{ height: '100%' }}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
      />
      {parseError != null && <div className="parse-error">⚠ {parseError}</div>}
    </div>
  )
}
