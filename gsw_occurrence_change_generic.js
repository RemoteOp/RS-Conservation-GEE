// ======================================================================
// GLOBAL SURFACE WATER (GSW) ANALYSIS — GENERIC VERSION
// ======================================================================

// ======================================================================
// USER SETTINGS
// ======================================================================

var country_name = 'Spain';                  //change to country of interest
var output_prefix = 'GSW_' + country_name;
var use_custom_aoi = true;                   // ← CHANGE to FALSE to use entire country
var start_year = 1984;
var end_year = 2021;

// ======================================================================
// SET SCALE
// ============================================================

// | Parameter       | Line            | Current Value | Options | Purpose                  |
// | Histogram scale | 182             | 100           | 30-1000 | Chart resolution         |
// | Reducer scale   | 197             | 30            | 30-1000 | Statistics resolution    |
// | Export scale    | 280,291,302,313 | 30            | 30-1000 | Raster export resolution |

// ======================================================================
// GSW TRANSITION CLASS DEFINITIONS (from JRC/GSW documentation)
// ======================================================================

// Define transition classes explicitly for reproducibility
var transition_class_definitions = {
  0: {name: 'No Data', color: '000000'},
  1: {name: 'Permanent Water', color: '0000FF'},
  2: {name: 'New Permanent', color: '00FFFF'},
  3: {name: 'Lost Permanent', color: '00008B'},
  4: {name: 'Seasonal Water', color: '00FF00'},
  5: {name: 'New Seasonal', color: '90EE90'},
  6: {name: 'Lost Seasonal', color: '006400'},
  7: {name: 'Seasonal to Permanent', color: 'FFFF00'},
  8: {name: 'Permanent to Seasonal', color: 'FF8C00'},
  9: {name: 'Ephemeral Permanent', color: 'FFD700'},
  10: {name: 'Ephemeral Seasonal', color: 'FF0000'}
};

// ======================================================================
// LOAD AOI
// ======================================================================

var AOI;
var AOI_geometry;
var aoi_label;

if (use_custom_aoi) {
  AOI = AOI;
  AOI_geometry = AOI.geometry ? AOI.geometry() : AOI;
  aoi_label = 'Custom AOI (imported)';
  output_prefix = output_prefix + '_CustomAOI';
  print("Using custom AOI from Imports panel");
} else {
  var LSIB = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017");
  AOI = LSIB.filter(ee.Filter.eq('country_na', country_name));
  AOI_geometry = AOI.geometry();
  aoi_label = country_name + ' (entire country)';
  output_prefix = output_prefix + '_Country';
  print("Using entire country:", country_name);
}

// ======================================================================
// LOAD GLOBAL SURFACE WATER (GSW) DATASET
// ======================================================================

var gsw = ee.Image('JRC/GSW1_0/GlobalSurfaceWater');
var occurrence = gsw.select('occurrence');
var change = gsw.select("change_abs");
var transition = gsw.select('transition');

print("GSW dataset loaded (" + start_year + "-" + end_year + ")");

// Verify GSW metadata
print("GSW Transition Class Values:", gsw.get('transition_class_values'));
print("GSW Transition Class Names:", gsw.get('transition_class_names'));
print("GSW Transition Class Palette (from dataset):", gsw.get('transition_class_palette'));

// ======================================================================
// VISUALIZATION PARAMETERS
// ======================================================================

var VIS_OCCURRENCE = {
  min: 0,
  max: 100,
  palette: ['red', 'blue']
};

var VIS_CHANGE = {
  min: -50,
  max: 50,
  palette: ['red', 'black', 'limegreen']
};

var VIS_WATER_MASK = {
  palette: ['white', 'black']
};

var VIS_TRANSITION = {  // Implemented for explicit definitions for documentation - palette is still pulled from GSW, see lookup beneath
  min: 0,
  max: 10,
  palette: [
    '000000', // 0: No Data
    '0000FF', // 1: Permanent Water
    '00FFFF', // 2: New Permanent
    '00008B', // 3: Lost Permanent
    '00FF00', // 4: Seasonal Water
    '90EE90', // 5: New Seasonal
    '006400', // 6: Lost Seasonal
    'FFFF00', // 7: Seasonal to Permanent
    'FF8C00', // 8: Permanent to Seasonal
    'FFD700', // 9: Ephemeral Permanent
    'FF0000'  // 10: Ephemeral Seasonal
  ]
};

// ======================================================================
// HELPER FUNCTIONS
// ======================================================================

function createFeature(transition_class_stats) {
  transition_class_stats = ee.Dictionary(transition_class_stats);
  var class_number = ee.Number(transition_class_stats.get('transition_class_value'));
  var class_key = class_number.format();
  var result = {
    transition_class_number: class_number,
    transition_class_name: lookup_names.get(class_key),
    transition_class_palette: lookup_palette.get(class_key),
    area_m2: transition_class_stats.get('sum')
  };
  return ee.Feature(null, result);
}

function createPieChartSliceDictionary(fc) {
  return ee.List(fc.aggregate_array("transition_class_palette"))
    .map(function(p) { return {'color': p}; }).getInfo();
}

function numToString(num) {
  return ee.Number(num).format();
}

// ======================================================================
// MAP STYLING
// ======================================================================

var AOI_Vis = AOI.style({
  color: "FF4500",
  width: 2,
  fillColor: "FFFFFF00"
});

Map.centerObject(AOI_geometry, 6);
Map.addLayer(AOI_Vis, {}, aoi_label);

// ======================================================================
// CALCULATIONS
// ======================================================================

var lookup_names = ee.Dictionary.fromLists(
  ee.List(gsw.get('transition_class_values')).map(numToString),
  gsw.get('transition_class_names')
);

var lookup_palette = ee.Dictionary.fromLists(
  ee.List(gsw.get('transition_class_values')).map(numToString),
  gsw.get('transition_class_palette')
);

var water_mask = occurrence.gt(90).selfMask();

// ======================================================================
// CHARTS
// ======================================================================

var histogram = ui.Chart.image.histogram({
  image: change,
  region: AOI_geometry,
  scale: 100,
  minBucketWidth: 10
});
histogram.setOptions({
  title: 'Histogram of surface water change intensity in ' + aoi_label
});
print(histogram);

var area_image_with_transition_class = ee.Image.pixelArea().addBands(transition);
var reduction_results = area_image_with_transition_class.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'transition_class_value',
  }),
  geometry: AOI_geometry,
  scale: 30,
  bestEffort: true,
});
print('reduction_results', reduction_results);

var roi_stats = ee.List(reduction_results.get('groups'));

var transition_fc = ee.FeatureCollection(roi_stats.map(createFeature));
print('transition_fc', transition_fc);

var transition_summary_chart = ui.Chart.feature.byFeature({
  features: transition_fc,
  xProperty: 'transition_class_name',
  yProperties: ['area_m2', 'transition_class_number']
})
  .setChartType('PieChart')
  .setOptions({
    title: 'Summary of transition class areas in ' + aoi_label,
    slices: createPieChartSliceDictionary(transition_fc),
    sliceVisibilityThreshold: 0
  });
print(transition_summary_chart);

// ======================================================================
// MAP LAYERS
// ======================================================================

Map.addLayer({
  eeObject: water_mask,
  visParams: VIS_WATER_MASK,
  name: '90% occurrence water mask',
  shown: false
});

Map.addLayer({
  eeObject: occurrence.updateMask(occurrence.divide(100)),
  name: "Water Occurrence (" + start_year + "-" + end_year + ")",
  visParams: VIS_OCCURRENCE,
  shown: false
});

Map.addLayer({
  eeObject: change,
  visParams: VIS_CHANGE,
  name: 'Occurrence change intensity',
  shown: false
});

Map.addLayer({
  eeObject: transition,
  visParams: VIS_TRANSITION,  // ← Now using explicit palette
  name: 'Transition classes (' + start_year + "-" + end_year + ")",
});

// ======================================================================
// CLIP & REPROJECT FOR EXPORTS
// ======================================================================

var proj = occurrence.projection();

var occurrence_aoi = occurrence.clip(AOI_geometry).reproject(proj);
var change_aoi = change.clip(AOI_geometry).reproject(proj);
var transition_aoi = transition.clip(AOI_geometry).reproject(proj);
var water_mask_aoi = occurrence.gt(90).selfMask().clip(AOI_geometry).reproject(proj);

// ======================================================================
// EXPORTS — WITH CRS
// ======================================================================

Export.table.toDrive({
  collection: transition_fc,
  description: output_prefix + '_Transition_Summary',
  fileNamePrefix: output_prefix + '_Transition_Summary',
  fileFormat: 'CSV',
  selectors: ['transition_class_number', 'transition_class_name', 'area_m2']
});

Export.image.toDrive({
  image: water_mask_aoi,
  description: output_prefix + '_Water_Mask_gt90',
  fileNamePrefix: output_prefix + '_Water_Mask_gt90',
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: 30,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

Export.image.toDrive({
  image: occurrence_aoi,
  description: output_prefix + '_Water_Occurrence_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Water_Occurrence_' + start_year + '_' + end_year,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: 30,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

Export.image.toDrive({
  image: change_aoi,
  description: output_prefix + '_Change_Intensity_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Change_Intensity_' + start_year + '_' + end_year,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: 30,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

Export.image.toDrive({
  image: transition_aoi,
  description: output_prefix + '_Transition_Classes_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Transition_Classes_' + start_year + '_' + end_year,
  maxPixels: 1e13,
  region: AOI_geometry,
  scale: 30,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

print("\n=== ALL EXPORTS QUEUED ===");
print("Output prefix:", output_prefix);
print("AOI:", aoi_label);
print("All files will be saved to Google Drive");
