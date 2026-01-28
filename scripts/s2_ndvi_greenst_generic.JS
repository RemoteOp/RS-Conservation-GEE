// ======================================================================
// NDVI GREENEST PIXEL (generic VERSION)
// ======================================================================

// Goal: Create a greenest-pixel NDVI composite from Sentinel-2 for a chosen period.
// Output: One NDVI composite (not a time-series/anomaly analysis).

// ======================================================================
// USER SETTINGS (edit these)
// ======================================================================

var country_name = 'Portugal';
var use_custom_aoi = false;       // TRUE = use imported AOI, FALSE = use GAUL admin boundaries

// Admin level (only used if use_custom_aoi = false)
var admin_level = 2;              // 0=country, 1=regions, 2=municipalities
var admin1_names = [];            // e.g. ['Lisboa', 'Porto']
var admin2_names = ['Odemira'];   // e.g. ['Lisboa']

var output_prefix = 'S2_NDVI_Greenest';

// Date range
var start_date = '2021-07-01';
var end_date   = '2021-07-31';

// Cloud filtering
var max_cloud_pct = 20;

// Mask to vegetation classes (ESA WorldCover)
// 10=Trees, 20=Shrubland, 30=Herbaceous vegetation
var mask_to_vegetation = true;
var veg_classes = [10, 20, 30];

// Export scale (Sentinel-2 native = 10m)
var export_scale = 10;

// Map view
var map_zoom = 8;

// ======================================================================
// LOAD AOI (Custom or GAUL Admin Boundaries)
// ======================================================================

var AOI_fc;
var AOI_geom;
var aoi_label;

// GAUL admin collections
var level0 = ee.FeatureCollection("FAO/GAUL/2015/level0");
var level1 = ee.FeatureCollection("FAO/GAUL/2015/level1");
var level2 = ee.FeatureCollection("FAO/GAUL/2015/level2");

if (use_custom_aoi) {
  // Import your AOI as "AOI" in the GEE Code Editor
  var AOI = AOI;
  AOI_geom = AOI.geometry ? AOI.geometry() : AOI;

  // Ensure FeatureCollection for reduceRegions()
  AOI_fc = AOI.geometry ? AOI : ee.FeatureCollection([ee.Feature(AOI_geom)]);
  aoi_label = 'Custom AOI';
  output_prefix = output_prefix + '_CustomAOI';
  print("Using custom AOI from Imports panel");
} else {
  if (admin_level === 0) {
    AOI_fc = level0.filter(ee.Filter.eq('ADM0_NAME', country_name));
    aoi_label = country_name + ' (Level 0)';
  } else if (admin_level === 1) {
    AOI_fc = level1.filter(ee.Filter.eq('ADM0_NAME', country_name));
    if (admin1_names.length > 0) {
      AOI_fc = AOI_fc.filter(ee.Filter.inList('ADM1_NAME', admin1_names));
      aoi_label = country_name + ' (Level 1: ' + admin1_names.join(', ') + ')';
    } else {
      aoi_label = country_name + ' (All Level 1)';
    }
  } else if (admin_level === 2) {
    AOI_fc = level2.filter(ee.Filter.eq('ADM0_NAME', country_name));
    if (admin1_names.length > 0) {
      AOI_fc = AOI_fc.filter(ee.Filter.inList('ADM1_NAME', admin1_names));
    }
    if (admin2_names.length > 0) {
      AOI_fc = AOI_fc.filter(ee.Filter.inList('ADM2_NAME', admin2_names));
      aoi_label = country_name + ' (Level 2: ' + admin2_names.join(', ') + ')';
    } else {
      aoi_label = country_name + ' (All Level 2)';
    }
  } else {
    throw new Error('admin_level must be 0, 1, or 2');
  }

  AOI_geom = AOI_fc.geometry();
  output_prefix = output_prefix + '_AdminLevel' + admin_level;
  print("Using GAUL admin boundaries:", aoi_label);
}

print("AOI feature count:", AOI_fc.size());

// ======================================================================
// CLOUD MASK FUNCTION (S2 SR)
// ======================================================================

function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask  = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000);
}

// ======================================================================
// LOAD SENTINEL-2 SR
// ======================================================================

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(start_date, end_date)
  .filterBounds(AOI_geom)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', max_cloud_pct))
  .map(maskS2clouds);

print("Images in collection:", s2.size());

// Mean composite
var s2_mean = s2.mean();

// NDVI
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
};

var s2_with_ndvi = s2.map(addNDVI);

// Greenest pixel composite
var greenest = s2_with_ndvi.qualityMosaic('NDVI');

// Optional vegetation mask
if (mask_to_vegetation) {
  var lc = ee.ImageCollection('ESA/WorldCover/v200').first();
  var veg_mask = lc.eq(veg_classes[0]);
  for (var i = 1; i < veg_classes.length; i++) {
    veg_mask = veg_mask.or(lc.eq(veg_classes[i]));
  }
  s2_mean = s2_mean.updateMask(veg_mask);
  greenest = greenest.updateMask(veg_mask);
}

// Clip to AOI
var ndvi_greenest = greenest.select('NDVI').clip(AOI_geom);

// ======================================================================
// VISUALIZATION
// ======================================================================

var aoi_vis = AOI_fc.style({color: "FF4500", width: 2, fillColor: "FFFFFF00"});
Map.addLayer(aoi_vis, null, "AOI");
Map.centerObject(AOI_geom, map_zoom);

var imageParams = {min: 0.0, max: 0.3, bands: ['B8', 'B4', 'B3']};
var ndviParams = {
  bands: "NDVI",
  min: 0.0,
  max: 1.0,
  palette: [
    'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
    '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
    '012E01', '011D01', '011301'
  ]
};

Map.addLayer(s2_mean, imageParams, 'S2 mean (masked)');
Map.addLayer(ndvi_greenest, ndviParams, 'NDVI greenest');

// ======================================================================
// STATS: MEAN NDVI PER ADMIN UNIT / AOI FEATURE
// ======================================================================

var ndvi_stats = ndvi_greenest.reduceRegions({
  collection: AOI_fc,
  reducer: ee.Reducer.mean(),
  scale: export_scale
});

print("NDVI mean per admin unit:", ndvi_stats);

// Build selectors based on admin level
var selectors = ['mean'];
if (!use_custom_aoi) {
  if (admin_level === 0) {
    selectors = ['ADM0_NAME', 'mean'];
  } else if (admin_level === 1) {
    selectors = ['ADM0_NAME', 'ADM1_NAME', 'mean'];
  } else if (admin_level === 2) {
    selectors = ['ADM0_NAME', 'ADM1_NAME', 'ADM2_NAME', 'mean'];
  }
}

// ======================================================================
// NDVi histogram (AOI-wide)
// ======================================================================

var ndvi_hist = ui.Chart.image.histogram({
  image: ndvi_greenest,
  region: AOI_geom,
  scale: export_scale * 3,
  minBucketWidth: 0.02,
  maxPixels: 1e13
}).setOptions({
  title: 'NDVI histogram (' + aoi_label + ')',
  hAxis: {
    title: 'NDVI',
    viewWindow: {min: -0.2, max: 0.9},
    ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8]
  },
  vAxis: {title: 'Pixel count'}
});
print(ndvi_hist);


// ======================================================================
// EXPORTS
// ======================================================================

Export.image.toDrive({
  image: ndvi_greenest,
  description: output_prefix + '_NDVI_Greenest',
  fileNamePrefix: output_prefix + '_NDVI_Greenest',
  region: AOI_geom,
  scale: export_scale,
  maxPixels: 1e13
});

Export.table.toDrive({
  collection: ndvi_stats,
  description: output_prefix + '_NDVI_Mean_By_Admin',
  fileNamePrefix: output_prefix + '_NDVI_Mean_By_Admin',
  fileFormat: 'CSV',
  selectors: selectors
});

print("Exports queued:", output_prefix);
