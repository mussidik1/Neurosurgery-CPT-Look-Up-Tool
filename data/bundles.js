// Bundling reminders: common pairs that are not reported together (CPT "do not report with" instructions,
// descriptors that already include the service, and CPT's critical care rules). This is a curated list of
// frequent neurosurgical situations, NOT the full Medicare NCCI edit table.
// bundle(code, otherCode, reason)        -> the two codes are not reported together (shown on both cards)
// included([codes], [inclusions], reason) -> the inclusions are not reported separately with any of the codes

// ---------- Spine ----------
bundle('22551', '63075', 'same level; ACDF already includes the discectomy');
bundle('22551', '22554', 'same level');
bundle('22552', '63076', 'same level');
bundle('22856', '22551', 'same level');
bundle('22856', '63075', 'same level');
bundle('22856', '22845', 'same level');
bundle('22856', '22853', 'same level');
bundle('22633', '22612', 'same interspace; 22633 already includes the posterolateral fusion');
bundle('22633', '22630', 'same interspace');
bundle('22634', '22614', 'same interspace');
bundle('22634', '22632', 'same interspace');
bundle('22630', '63047', 'same level; decompression beyond the interbody prep goes on 63052');
bundle('22633', '63047', 'same level; decompression beyond the interbody prep goes on 63052');
bundle('22630', '63030', 'same level');
bundle('22633', '63030', 'same level');
bundle('22867', '63047', 'same level; 22867 already includes the decompression');
bundle('22867', '22612', 'same level');
bundle('22867', '22869', 'same level');
bundle('22869', '63047', 'same level; if you decompress, the device code is 22867');
bundle('22869', '22612', 'same level');
bundle('62287', '62290', 'treated level; discography is included');
bundle('62287', '62323', 'treated level; the epidural injection is included');
bundle('61343', '63710', 'the dural graft is part of 61343');
included(['22510', '22511', '22513', '22514'], ['20225'], 'bone biopsy is included');
included(['22510', '22511', '22512', '22513', '22514', '22515'], ['77003', '77012'], 'imaging guidance is included');
included(['22551', '22552', '22856', '22858', '63075', '63076', '61548', '64727'], ['69990'], 'the operating microscope is included');

// ---------- Spine and pain injections: imaging is part of the code ----------
included(['62321', '62323', '62328', '62329', '64479', '64480', '64483', '64484', '64490', '64491', '64492', '64493', '64494', '64495',
  '64633', '64634', '64635', '64636', '27096', '64451', '64625'], ['77003', '77012'], 'imaging guidance is included');
included(['20611'], ['76942'], 'ultrasound guidance is included');
included(['32555', '32557', '49083'], ['76942'], 'imaging guidance is included');
included(['36573'], ['76937'], 'imaging guidance is included');

// ---------- Stereotactic procedures already include navigation ----------
included(['61720', '61735', '61750', '61751', '61760', '61770', '61790', '61791', '61796', '61797', '61798', '61799',
  '61863', '61864', '61867', '61868', '62201'], ['61781', '61782'], 'stereotactic navigation is already part of this procedure');
included(['61715', '61736', '61737'], ['61781', '61800'], 'navigation and frame placement are already part of this procedure');

// ---------- Neuro-endovascular ----------
included(['61645', '61650'], ['36224', '36226', '36228'], 'same vascular territory; diagnostic angiography of the treated territory is included');
bundle('61640', '61650', 'same vascular territory');
included(['37215', '37216'], ['36222', '36223', '36224'], 'treated carotid; its angiography is included in the stent code');

// ---------- Critical care (same physician, same time period) ----------
included(['99291', '99292'], ['36000', '36410', '36415', '36591', '36600', '43752', '43753', '71045', '71046', '92953', '93598',
  '94002', '94003', '94004', '94660', '94662', '94760', '94761', '94762'], 'included in critical care when the same physician does it');

// Neonatal and pediatric critical and intensive care are per-day codes that also include the bedside procedures above
// plus intubation, central and arterial lines, LP, bladder catheters and transfusion.
included(['99468', '99469', '99471', '99472', '99475', '99476', '99477', '99478', '99479', '99480'], ['31500', '36000', '36410',
  '36415', '36430', '36555', '36591', '36600', '36620', '43752', '43753', '51701', '51702', '62270', '71045', '71046', '92953',
  '93598', '94002', '94003', '94004', '94660', '94662', '94760', '94761', '94762'],
  'included in the per-day neonatal and pediatric critical and intensive care codes when the same physician does it that day');

// ---------- ECMO ----------
included(['33946', '33947'], ['33948', '33949'], 'not on the day ECMO starts, by any physician; initiation covers that day’s management');

// ---------- Pericardium ----------
included(['33017', '33018'], ['33016'], 'the needle drainage is part of placing the drain');
included(['33016', '33017', '33018'], ['76942', '77002', '77012', '77021'], 'imaging guidance is included');
