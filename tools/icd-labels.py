"""Validate every ICD-10-CM code in data/dx.js and write data/icd10.json with official descriptions.
Requires: pip install simple-icd-10-cm   (ships the CDC ICD-10-CM release; checked against April 2026)
Fails if any code is invalid or is a non-billable heading.
Usage: python3 tools/icd-labels.py
"""
import json, os, re, sys
import simple_icd_10_cm as cm

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = open(os.path.join(ROOT, 'data', 'dx.js'), encoding='utf-8').read()
src = re.sub(r'//.*', '', src)  # ignore comments
codes = sorted(set(re.findall(r"'([A-Z][0-9][0-9A-Z]\.[0-9A-Z]{1,4})'", src)))
bad = [c for c in codes if not (cm.is_valid_item(c) and cm.is_leaf(c))]
if bad:
    print('Invalid or non-billable ICD-10-CM codes:', ', '.join(bad))
    sys.exit(1)
labels = {c: cm.get_description(c) for c in codes}
with open(os.path.join(ROOT, 'data', 'icd10.json'), 'w', encoding='utf-8') as f:
    json.dump(labels, f, indent=1, ensure_ascii=False, sort_keys=True)
    f.write('\n')
print(f'{len(codes)} ICD-10-CM codes validated (billable) and written to data/icd10.json')
