import { TextField } from './TextField.jsx';

/** A number input — TextField switches its `type` on the field's own type. */
export function NumberField(props) {
  return <TextField {...props} />;
}
