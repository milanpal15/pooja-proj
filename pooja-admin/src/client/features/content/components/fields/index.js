import { BoolField } from './BoolField.jsx';
import { DateField } from './DateField.jsx';
import { DayIsoField } from './DayIsoField.jsx';
import { EnumListField } from './EnumListField.jsx';
import { HtmlField } from './HtmlField.jsx';
import { HtmlPreviewField } from './HtmlPreviewField.jsx';
import { MediaField } from './MediaField.jsx';
import { NoticeField } from './NoticeField.jsx';
import { NumberField } from './NumberField.jsx';
import { SegmentedField } from './SegmentedField.jsx';
import { SelectField } from './SelectField.jsx';
import { TextField } from './TextField.jsx';
import { TextareaField } from './TextareaField.jsx';

/**
 * One component per field type. A new type is one file plus one line here;
 * anything unlisted (and `csv`) falls back to a text box, as it always has.
 */
const FIELD_TYPES = {
  text: TextField,
  csv: TextField,
  number: NumberField,
  textarea: TextareaField,
  date: DateField,
  select: SelectField,
  segmented: SegmentedField,
  enumList: EnumListField,
  bool: BoolField,
  image: MediaField,
  audio: MediaField,
  html: HtmlField,
  htmlPreview: HtmlPreviewField,
  notice: NoticeField,
  dayIso: DayIsoField,
};

export const fieldComponent = (type) => FIELD_TYPES[type] || TextField;
