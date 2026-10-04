// Campo de PIN (6 dígitos). Solo deja escribir números; el PIN nunca va en la
// URL, en localStorage ni en la consola.
export function PinField({ label, value, onChange, disabled, autoFocus }) {
  return (
    <label className="form" style={{ marginTop: 8 }}>
      {label}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        disabled={disabled}
      />
    </label>
  );
}
