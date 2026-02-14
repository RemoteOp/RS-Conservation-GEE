// ======================================================================
// GLOBAL SURFACE WATER (GSW) ANALYSIS - GSW1_4 ROBUST VERSION
// ======================================================================

// ======================================================================
// 1) USER SETTINGS
// ======================================================================
var country_name   = 'Spain';
var use_custom_aoi = true;     // true = imported AOI, false = country boundary
var aoi_name       = 'AOI_Inland_bassin'; // only used when use_custom_aoi = true

var start_year     = 1984;
var end_year       = 2021;

// For whole-country AOIs, keep chart/stats coarse to avoid maxPixels/timeouts.
var HIST_SCALE   = 100;
var STATS_SCALE  = 30;
var EXPORT_SCALE = 30;

// Safe text for export/task names
function slugifyName(s) {
  return String(s)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]/g, '');
}

// Set later based on AOI mode
var output_prefix;

// ======================================================================
// 2) TRANSITION CLASS DEFINITIONS (for chart labels/colors)
// ======================================================================
var transition_class_definitions = {
  0:  {name: 'No Change',             color: '#ffffff'},
  1:  {name: 'Permanent Water',       color: '#0000ff'},
  2:  {name: 'New Permanent',         color: '#22b14c'},
  3:  {name: 'Lost Permanent',        color: '#d1102d'},
  4:  {name: 'Seasonal Water',        color: '#99d9ea'},
  5:  {name: 'New Seasonal',          color: '#b5e61d'},
  6:  {name: 'Lost Seasonal',         color: '#e6a1aa'},
  7:  {name: 'Seasonal to Permanent', color: '#ff7f27'},
  8:  {name: 'Permanent to Seasonal', color: '#ffc90e'},
  9:  {name: 'Ephemeral Permanent',   color: '#7f7f7f'},
  10: {name: 'Ephemeral Seasonal',    color: '#c3c3c3'}
};

// Also keep index lists for robust EE lookups (avoids "Unknown" mismatches).
var class_names = ee.List([
  'No Change', 'Permanent Water', 'New Permanent', 'Lost Permanent',
  'Seasonal Water', 'New Seasonal', 'Lost Seasonal',
  'Seasonal to Permanent', 'Permanent to Seasonal',
  'Ephemeral Permanent', 'Ephemeral Seasonal'
]);

var class_colors = ee.List([
  '#ffffff', '#0000ff', '#22b14c', '#d1102d', '#99d9ea',
  '#b5e61d', '#e6a1aa', '#ff7f27', '#ffc90e', '#7f7f7f', '#c3c3c3'
]);

// ======================================================================
// 3) LOAD AOI
// ======================================================================
var AOI;
var AOI_geometry;
var aoi_label;

if (use_custom_aoi) {
  if (typeof AOI === 'undefined') {
    throw new Error('use_custom_aoi=true, but no AOI was imported. Import AOI in the Imports panel.');
  }
  AOI_geometry = AOI.geometry ? AOI.geometry() : AOI;
  aoi_label = aoi_name;
  output_prefix = 'GSW_' + slugifyName(aoi_name);
  print('Using custom AOI from Imports panel:', aoi_name);
} else {
  var LSIB = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
  AOI = LSIB.filter(ee.Filter.eq('country_na', country_name));
  AOI_geometry = AOI.geometry();
  aoi_label = country_name + ' (entire country)';
  output_prefix = 'GSW_' + slugifyName(country_name);
  print('Using entire country:', country_name);
}


// ======================================================================
// 4) LOAD GSW 1.4 DATA
// ======================================================================
var gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater');
var occurrence = gsw.select('occurrence');
var change     = gsw.select('change_abs');
var transition = gsw.select('transition');
var max_extent = gsw.select('max_extent');

print('GSW bands:', gsw.bandNames());

// ======================================================================
// 5) VISUALIZATION STYLES
// ======================================================================
var VIS_OCCURRENCE = {min: 0, max: 100, palette: ['red', 'blue']};
var VIS_CHANGE     = {min: -50, max: 50, palette: ['red', 'black', 'limegreen']};
var VIS_WATER_MASK = {palette: ['white', 'black']};
var VIS_TRANSITION = {
  min: 0, max: 10,
  palette: [
    '#ffffff', '#0000ff', '#22b14c', '#d1102d', '#99d9ea',
    '#b5e61d', '#e6a1aa', '#ff7f27', '#ffc90e', '#7f7f7f', '#c3c3c3'
  ]
};

// ======================================================================
// 6) MAP CONTEXT
// ======================================================================
Map.centerObject(AOI_geometry, 6);

var aoi_outline = ee.Image().byte().paint(
  ee.FeatureCollection([ee.Feature(AOI_geometry)]), 1, 2
);
Map.addLayer(aoi_outline, {palette: ['FF4500']}, aoi_label, true);

var water_mask = occurrence.gt(90).selfMask();

// ======================================================================
// 7a) HISTOGRAM (change intensity frequency pixels )
// ======================================================================
var histogram = ui.Chart.image.histogram({
  image: change,
  region: AOI_geometry,
  scale: HIST_SCALE,
  minBucketWidth: 10
}).setOptions({
  title: 'Histogram of surface water change intensity in ' + aoi_label +
         ' (scale ' + HIST_SCALE + ')'
});
print(histogram);

// ======================================================================
// 7b) HISTOGRAM (km2 per change-intensity bin)
// ======================================================================
var BIN_WIDTH = 10;

// Keep only valid GSW change values; removes no-data artifacts like -128.
var change_valid = change
  .clip(AOI_geometry)
  .updateMask(change.gte(-100).and(change.lte(100)));

// Bin values: ... -100, -90, ..., 90, 100
var change_bin = change_valid
  .divide(BIN_WIDTH)
  .floor()
  .multiply(BIN_WIDTH)
  .toInt()
  .rename('bin');

// Sum pixel area (km2) per bin
var bin_area_dict = ee.Image.pixelArea().divide(1e6).rename('area_km2')
  .addBands(change_bin)
  .reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'bin'
    }),
    geometry: AOI_geometry,
    scale: HIST_SCALE,
    maxPixels: 1e13,
    bestEffort: true,
    tileScale: 16
  });

var bin_groups = ee.List(ee.Dictionary(bin_area_dict).get('groups', ee.List([])));

var hist_fc = ee.FeatureCollection(bin_groups.map(function(g) {
  g = ee.Dictionary(g);
  var b = ee.Number(g.get('bin')).toInt();
  return ee.Feature(null, {
    bin: b,
    bin_label: b.format('%d').cat(' to ').cat(b.add(BIN_WIDTH).format('%d')),
    area_km2: ee.Number(g.get('sum'))
  });
})).sort('bin');

var histogram_km2 = ui.Chart.feature.byFeature({
  features: hist_fc,
  xProperty: 'bin_label',
  yProperties: ['area_km2']
})
.setChartType('ColumnChart')
.setOptions({
  title: 'Surface water change intensity histogram in ' + aoi_label +
         ' (km2 per ' + BIN_WIDTH + '-unit bin, scale ' + HIST_SCALE + ' m)',
  hAxis: {title: 'Change intensity bin'},
  vAxis: {title: 'Area (km2)'},
  legend: {position: 'none'}
});

print(histogram_km2);


// ======================================================================
// 8) HELPERS FOR TRANSITION AREA TABLE (all areas in km2)
// ======================================================================
function createFeature(transition_class_stats) {
  transition_class_stats = ee.Dictionary(transition_class_stats);

  var class_number = ee.Number(
    transition_class_stats.get('transition_class_value')
  ).toInt();

  var valid = class_number.gte(0).and(class_number.lte(10));

  var class_name = ee.String(ee.Algorithms.If(
    valid, class_names.get(class_number), 'Unknown'
  ));

  var class_color = ee.String(ee.Algorithms.If(
    valid, class_colors.get(class_number), '#999999'
  ));

  var area_km2 = ee.Number(transition_class_stats.get('sum', 0)).divide(1e6);

  return ee.Feature(null, {
    transition_class_number: class_number,
    transition_class_name: class_name,
    transition_class_palette: class_color,
    area_km2: area_km2
  });
}

function createPieChartSliceDictionary(fc) {
  var palettes = ee.List(fc.aggregate_array('transition_class_palette'));
  return palettes.map(function(p) {
    return ee.Dictionary({color: p});
  }).getInfo();
}

// ======================================================================
// 9) TRANSITION AREA STATS (km2)
// ======================================================================
var area_image_with_transition_class = ee.Image.pixelArea().addBands(transition);

var reduction_results = area_image_with_transition_class.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'transition_class_value'
  }),
  geometry: AOI_geometry,
  scale: STATS_SCALE,
  maxPixels: 1e13,
  bestEffort: true,
  tileScale: 16
});
print('reduction_results', reduction_results);

var groups = ee.List(reduction_results.get('groups'));
groups = ee.List(ee.Algorithms.If(groups, groups, ee.List([])));
print('groups size', groups.size());

var transition_fc = ee.FeatureCollection(groups.map(createFeature))
  .filter(ee.Filter.gt('area_km2', 0))
  .sort('area_km2', false);

print('transition_fc (km2)', transition_fc);

// ======================================================================
// 10) PIE CHART (transition class areas in km2)
// ======================================================================

var pie = ui.Chart.feature.byFeature({
  features: transition_fc,
  xProperty: 'transition_class_name',
  yProperties: ['area_km2']
})
.setChartType('PieChart')
.setOptions({
  title: 'Summary of transition class areas in ' + aoi_label + ' (km2)',
  legend: {position: 'right'},
  sliceVisibilityThreshold: 0,
  slices: createPieChartSliceDictionary(transition_fc)
});

print(pie);


// ======================================================================
// 11) MAP LAYERS
// ======================================================================
var transition_display = transition.unmask(0);

Map.addLayer(
  transition_display.clip(AOI_geometry),
  VIS_TRANSITION,
  'Transition (unmasked for display)',
  false
);

Map.addLayer(
  max_extent.clip(AOI_geometry),
  {min: 0, max: 1, palette: ['ffffff', '0000ff']},
  'Max extent (ever water)',
  false
);

Map.addLayer(water_mask, VIS_WATER_MASK, '90% occurrence water mask', false);

Map.addLayer(
  occurrence.updateMask(occurrence.divide(100)),
  VIS_OCCURRENCE,
  'Water Occurrence (' + start_year + '-' + end_year + ')',
  false
);

Map.addLayer(change, VIS_CHANGE, 'Occurrence change intensity', false);

Map.addLayer(
  transition.clip(AOI_geometry),
  VIS_TRANSITION,
  'Transition classes (' + start_year + '-' + end_year + ')',
  true
);

// ======================================================================
// 12) CLIP/REPROJECT FOR EXPORTS
// ======================================================================
var proj = occurrence.projection();

var occurrence_aoi = occurrence.clip(AOI_geometry).reproject(proj);
var change_aoi     = change.clip(AOI_geometry).reproject(proj);
var transition_aoi = transition.clip(AOI_geometry).reproject(proj);
var water_mask_aoi = occurrence.gt(90).selfMask().clip(AOI_geometry).reproject(proj);

// ======================================================================
// 13) EXPORTS
// ======================================================================
Export.table.toDrive({
  collection: transition_fc,
  description: output_prefix + '_Transition_Summary_km2',
  fileNamePrefix: output_prefix + '_Transition_Summary_km2',
  fileFormat: 'CSV',
  selectors: ['transition_class_number', 'transition_class_name', 'area_km2']
});

Export.image.toDrive({
  image: water_mask_aoi,
  description: output_prefix + '_Water_Mask_gt90',
  fileNamePrefix: output_prefix + '_Water_Mask_gt90',
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: EXPORT_SCALE,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

Export.image.toDrive({
  image: occurrence_aoi,
  description: output_prefix + '_Water_Occurrence_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Water_Occurrence_' + start_year + '_' + end_year,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: EXPORT_SCALE,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

Export.image.toDrive({
  image: change_aoi,
  description: output_prefix + '_Change_Intensity_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Change_Intensity_' + start_year + '_' + end_year,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: EXPORT_SCALE,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

Export.image.toDrive({
  image: transition_aoi,
  description: output_prefix + '_Transition_Classes_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Transition_Classes_' + start_year + '_' + end_year,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: EXPORT_SCALE,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

// ======================================================================
// 14) RUN SUMMARY
// ======================================================================
print('\n=== ALL EXPORTS QUEUED ===');
print('Output prefix:', output_prefix);
print('AOI:', aoi_label);
print('HIST_SCALE:', HIST_SCALE);
print('STATS_SCALE:', STATS_SCALE);
print('EXPORT_SCALE:', EXPORT_SCALE);
print('Area units in outputs/charts: km2');
