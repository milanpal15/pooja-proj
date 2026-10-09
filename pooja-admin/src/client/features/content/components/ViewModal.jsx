import { ViewOnlyModal } from '../../../ui/index.js';
import { FieldList } from './FieldList.jsx';

/** A row's details for an account that cannot edit: values as text, one Close button. */
export function ViewModal({ title, fields, values, onClose }) {
  return (
    <ViewOnlyModal title={title} onClose={onClose}>
      <FieldList readOnly fields={fields} values={values} />
    </ViewOnlyModal>
  );
}
