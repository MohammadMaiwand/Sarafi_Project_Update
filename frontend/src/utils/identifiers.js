// Identifiers remain strings; never group or numerically coerce them.
export const maskIdentifier=value=>value?`${'•'.repeat(Math.max(0,String(value).length-4))}${String(value).slice(-4)}`:'—'
