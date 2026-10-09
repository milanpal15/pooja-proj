import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Button } from '../../../../ui/index.js';
import { PackageRow } from './PackageRow.jsx';

/** Packages, priced in coins: a header row, one row each, add / reorder / remove. */
export function PackagesSection({ editor }) {
  const { draft, errors } = editor;
  const { busy, upload } = useUpload();
  const onFile = async (p, file) => {
    const url = await upload(file, p._cid);
    if (url) editor.setPackage(p._cid, { image: url });
  };
  return (
    <>
      <div className="pj-pkg pj-pkg--head" aria-hidden="true">
        <div className="pj-pkg__row">
          <span>Name (English)</span>
          <span>People</span>
          <span>Coins</span>
          <span>Shown</span>
          <span />
        </div>
      </div>
      <ul className="pj-pkgs" aria-label="Packages">
        {draft.packages.map((p, i) => (
          <PackageRow
            key={p._cid}
            pkg={p}
            index={i}
            count={draft.packages.length}
            errors={errors.packages?.[p._cid]}
            uploading={busy === p._cid}
            onChange={(patch) => editor.setPackage(p._cid, patch)}
            onFile={(f) => onFile(p, f)}
            onMove={(d) => editor.movePackage(i, d)}
            onRemove={() => editor.removePackage(p._cid)}
          />
        ))}
      </ul>
      {errors.packagesGeneral && (
        <p className="ui-field__error" role="alert">
          {errors.packagesGeneral}
        </p>
      )}
      <div className="pj-pkgs__foot">
        <Button variant="outline" disabled={draft.packages.length >= 12} onClick={editor.addPackage}>
          + Add package
        </Button>
        <p className="ui-field__hint">Devotees see the price in coins only. 1 coin is ₹1 before any pack offer. The number of people decides how many names the devotee must enter.</p>
      </div>
    </>
  );
}
