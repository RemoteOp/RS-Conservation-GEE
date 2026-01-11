// ======================================================================
// GLOBAL FOREST CHANGE (GFC) ANALYSIS — GENERIC VERSION
// ======================================================================

// ======================================================================
// USER SETTINGS (edit these)
// ======================================================================

var country_name = 'Spain';  // Change to your country
var output_prefix = 'GFC_' + country_name;

// CHOOSE AOI TYPE
var use_custom_aoi = true;  // Set to TRUE to use imported AOI, FALSE for entire country
// If use_custom_aoi = TRUE, make sure to import your AOI vector file in the Code Editor
// Rename the import to "AOI" in the Imports panel

// ======================================================================
// TIME PERIOD SETTINGS (Hansen GFC Data)
// ======================================================================

// Hansen GFC covers 2000-2024
var start_year = 2000;
var end_year = 2024;

// ======================================================================
// PROCESSING SETTINGS
// ======================================================================

var scale = 30;  // Resolution in meters
                  // Options: 30m (native Landsat), 100m (fast), 250m (fastest)
                  // Note: Hansen GFC native resolution is 30m

// ======================================================================
// LOAD AOI (Country or Custom - imported via Imports panel)
// ======================================================================

var AOI;
var AOI_geometry;
var aoi_label;

if (use_custom_aoi) {
  // Use the imported AOI variable (you must import it in the Code Editor Imports panel first)
  // Rename your import to "AOI" in the Imports panel
  AOI = AOI;  // This references the imported variable from Imports
  
  // Handle both FeatureCollection and Geometry types
  if (AOI.geometry) {
    // If it's a FeatureCollection, extract geometry
    AOI_geometry = AOI.geometry();
  } else if (AOI.type && AOI.type() === 'Geometry') {
    // If it's already a Geometry
    AOI_geometry = AOI;
  } else if (AOI instanceof ee.FeatureCollection) {
    // If it's a FeatureCollection without .geometry method
    AOI_geometry = AOI.first().geometry();
  } else {
    // Fallback: assume it's a geometry
    AOI_geometry = AOI;
  }
  
  aoi_label = 'Custom AOI (imported)';
  output_prefix = output_prefix + '_CustomAOI';
  print("Using custom AOI from Imports panel");
  print("AOI_geometry:", AOI_geometry);
  
} else {
  // Load country boundary (LSIB dataset)
  var LSIB = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017");
  AOI = LSIB.filter(ee.Filter.eq('country_na', country_name));
  AOI_geometry = AOI.geometry();
  aoi_label = country_name + ' (entire country)';
  output_prefix = output_prefix + '_Country';
  print("Using entire country:", country_name);
}

// ======================================================================
// LOAD HANSEN GLOBAL FOREST CHANGE (GFC) DATA
// ======================================================================

// ======================================================================
// HANSEN GLOBAL FOREST CHANGE DATASET INFORMATION
// ======================================================================
//
// DATASET: UMD/hansen/global_forest_change_2024_v1_12
// Coverage: Global tree cover >25% canopy density, 2000-2024
// Resolution: 30m Landsat-based
// Provider: University of Maryland / Google Earth Engine
//
// AVAILABLE BANDS:
// - treecover2000: Tree canopy cover % (0-100) in year 2000
// - loss: Binary mask (1=forest loss detected, 0=no loss)
// - lossyear: Year of loss detection (0-24 = 2000-2024, 0=no loss)
// - gain: Binary mask (1=forest gain, 0=no gain) - limited coverage
// - datamask: Data quality mask (1=valid, 2=water)
//
// KEY METRICS:
// - Forest loss: Area where tree cover >25% canopy was lost (2000-2024)
// - Forest gain: Increased tree cover (2000-2012, limited/delayed data)
// - Tree cover 2000: Baseline forest extent in year 2000
//
// INTERPRETATION:
// - loss/lossyear: Primary deforestation indicator
// - gain: Secondary (often underestimated, delayed satellite detection)
// - Combines loss + gain for NET forest change
//
// LIMITATIONS:
// - Detects loss, not necessarily deforestation (includes natural disturbance)
// - Gain data ends in 2012 (only loss data through 2024)
// - Threshold: only detects loss in areas with >25% canopy in 2000
// ======================================================================

var gfc = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');

// Extract individual bands
var treecover2000 = gfc.select('treecover2000');
var loss = gfc.select('loss');
var lossyear = gfc.select('lossyear');
var gain = gfc.select('gain');

print("Hansen GFC dataset loaded (" + start_year + "-" + end_year + ")");
print("Dataset bands:", gfc.bandNames());

// ======================================================================
// CLIP TO AOI
// ======================================================================

var treecover2000_aoi = treecover2000.clip(AOI_geometry);
var loss_aoi = loss.clip(AOI_geometry);
var lossyear_aoi = lossyear.clip(AOI_geometry);
var gain_aoi = gain.clip(AOI_geometry);

// ======================================================================
// VISUALIZATION PARAMETERS
// ======================================================================

// Tree cover 2000 (baseline forest extent)
var treeCoverVisParam = {
  bands: ['treecover2000'],
  min: 0,
  max: 100,
  palette: ['000000', '00FF00']  // Black (no forest) to Green (dense forest)
};

// Loss year (when tree cover was lost)
var treeLossVisParam = {
  bands: ['lossyear'],
  min: 0,
  max: 24,
  palette: ['yellow', 'red']  // Yellow (early loss 2000-2010) to Red (recent loss 2020-2024)
};

// Loss presence/absence (binary)
var tree_loss_vis = {
  bands: ['loss'],
  min: 0,
  max: 1,
  palette: ['000000', 'FF0000']  // Black (no loss) to Red (loss detected)
};

// Gain presence/absence (binary) — NOTE: limited to 2000-2012
var tree_gain_vis = {
  bands: ['gain'],
  min: 0,
  max: 1,
  palette: ['000000', '9900FF']  // Black (no gain) to Purple (gain detected)
};

// ======================================================================
// MAP VISUALIZATION
// ======================================================================

var AOI_Vis = AOI.style({
  color: "FF4500",
  width: 2,
  fillColor: "FFFFFF00"
});

Map.addLayer(AOI_Vis, {}, aoi_label);
Map.centerObject(AOI_geometry, 6);

// Add map layers
Map.addLayer({
  eeObject: treecover2000_aoi.updateMask(treecover2000_aoi.gt(0)),
  visParams: treeCoverVisParam,
  name: "Tree Cover 2000 (%)",
  shown: true
});

Map.addLayer({
  eeObject: lossyear_aoi.updateMask(lossyear_aoi.gt(0)),
  visParams: treeLossVisParam,
  name: "Forest Loss Year (2000-2024)",
  shown: false
});

Map.addLayer({
  eeObject: loss_aoi,
  visParams: tree_loss_vis,
  name: "Forest Loss (binary)",
  shown: false
});

Map.addLayer({
  eeObject: gain_aoi,
  visParams: tree_gain_vis,
  name: "Forest Gain (2000-2012, binary)",
  shown: false
});

// ======================================================================
// CALCULATE FOREST STATISTICS
// ======================================================================

// Total forest area in 2000 (pixels with >25% tree cover)
var forest_2000_area = treecover2000_aoi
  .gt(25)  // Pixels with >25% canopy density
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: AOI_geometry,
    scale: scale,
    bestEffort: true
  });

// Total loss area (in hectares)
var loss_area = loss_aoi
  .multiply(ee.Image.pixelArea())
  .divide(10000)  // Convert m² to hectares
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: AOI_geometry,
    scale: scale,
    bestEffort: true
  });

// Total gain area (in hectares) — NOTE: 2000-2012 only
var gain_area = gain_aoi
  .multiply(ee.Image.pixelArea())
  .divide(10000)  // Convert m² to hectares
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: AOI_geometry,
    scale: scale,
    bestEffort: true
  });

// Loss by year
var loss_by_year = lossyear_aoi
  .gt(0)  // Pixels where loss occurred
  .multiply(ee.Image.pixelArea())
  .divide(10000)  // Convert m² to hectares
  .addBands(lossyear_aoi)
  .reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'year'
    }),
    geometry: AOI_geometry,
    scale: scale,
    bestEffort: true
  });

print("\n=== FOREST CHANGE STATISTICS ===");
print("Forest area 2000 (>25% canopy, ha):", forest_2000_area.get('treecover2000'));
print("Total forest loss (ha):", loss_area.get('loss'));
print("Total forest gain (ha, 2000-2012):", gain_area.get('gain'));
print("Loss by year:", loss_by_year);

// ======================================================================
// EXPORT RASTER DATA — WITH CRS
// ======================================================================

// Export tree cover 2000 (baseline)
Export.image.toDrive({
  image: treecover2000_aoi,
  description: output_prefix + '_TreeCover2000',
  fileNamePrefix: output_prefix + '_TreeCover2000',
  region: AOI_geometry,
  scale: scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

// Export forest loss (binary)
Export.image.toDrive({
  image: loss_aoi,
  description: output_prefix + '_Loss_Binary_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Loss_Binary_' + start_year + '_' + end_year,
  region: AOI_geometry,
  scale: scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

// Export loss year (when loss occurred)
Export.image.toDrive({
  image: lossyear_aoi,
  description: output_prefix + '_LossYear_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_LossYear_' + start_year + '_' + end_year,
  region: AOI_geometry,
  scale: scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

// Export forest gain (binary) — NOTE: limited to 2000-2012
Export.image.toDrive({
  image: gain_aoi,
  description: output_prefix + '_Gain_Binary_2000_2012',
  fileNamePrefix: output_prefix + '_Gain_Binary_2000_2012',
  region: AOI_geometry,
  scale: scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

// Export all bands together (complete dataset)
Export.image.toDrive({
  image: gfc.select('treecover2000', 'loss', 'lossyear', 'gain').clip(AOI_geometry),
  description: output_prefix + '_Complete_' + start_year + '_' + end_year,
  fileNamePrefix: output_prefix + '_Complete_' + start_year + '_' + end_year,
  region: AOI_geometry,
  scale: scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'  // ← ADDED: WGS84 CRS
});

print("\n=== ALL EXPORTS QUEUED ===");
print("Output prefix:", output_prefix);
print("AOI:", aoi_label);
print("Time period:", start_year + "-" + end_year);
print("Scale:", scale + " m");
print("All files will be saved to Google Drive");
