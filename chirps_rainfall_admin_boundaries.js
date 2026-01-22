// ======================================================================
// CHIRPS Rainfall Analysis — ADMIN BOUNDARIES VERSION
// ======================================================================

// ======================================================================
// USER SETTINGS (edit these)
// ======================================================================

var country_name = 'Portugal'; // change to country of interest

// Choose AOI source
var use_custom_aoi = false;  // TRUE = use imported AOI, FALSE = use GAUL admin boundaries

// Admin level selection (only used if use_custom_aoi = false)
// 0 = country, 1 = regions/provinces, 2 = municipalities/counties
var admin_level = 2;

// Optional filters by name (leave [] for all)
var admin1_names = []; // change to region e.g. ['Lisboa', 'Porto']
var admin2_names = ['Odemira']; // change to municipality e.g. ['Odemira']

// Study period
var study_start = '2024-01-01';
var study_end   = '2024-12-31';

// Baseline period
var baseline_start_year = 2000;
var baseline_end_year   = 2015;

// Day of year range (for seasonal analysis)
var doy_start = 1;
var doy_end   = 365;

// Output prefix (all exports will use this)
var output_prefix = 'Rainfall_' + country_name;

// ======================================================================
// LOAD ADMIN BOUNDARIES (GAUL)
// ======================================================================

var level0 = ee.FeatureCollection("FAO/GAUL/2015/level0");
var level1 = ee.FeatureCollection("FAO/GAUL/2015/level1");
var level2 = ee.FeatureCollection("FAO/GAUL/2015/level2");

// ======================================================================
// BUILD AOI (custom or admin boundaries)
// ======================================================================

var AOI;
var AOIgeom;
var aoi_label;

if (use_custom_aoi) {
  AOI = AOI;  // Imported variable from Imports panel
  AOIgeom = AOI.geometry ? AOI.geometry() : AOI;
  aoi_label = 'Custom AOI (imported)';
  output_prefix = output_prefix + '_CustomAOI';
  print("Using custom AOI from Imports panel");
} else {
  if (admin_level === 0) {
    AOI = level0.filter(ee.Filter.eq('ADM0_NAME', country_name));
    aoi_label = country_name + ' (Level 0)';
  } else if (admin_level === 1) {
    AOI = level1.filter(ee.Filter.eq('ADM0_NAME', country_name));
    if (admin1_names.length > 0) {
      AOI = AOI.filter(ee.Filter.inList('ADM1_NAME', admin1_names));
      aoi_label = country_name + ' (Level 1: ' + admin1_names.join(', ') + ')';
    } else {
      aoi_label = country_name + ' (All Level 1)';
    }
  } else if (admin_level === 2) {
    AOI = level2.filter(ee.Filter.eq('ADM0_NAME', country_name));
    if (admin1_names.length > 0) {
      AOI = AOI.filter(ee.Filter.inList('ADM1_NAME', admin1_names));
    }
    if (admin2_names.length > 0) {
      AOI = AOI.filter(ee.Filter.inList('ADM2_NAME', admin2_names));
      aoi_label = country_name + ' (Level 2: ' + admin2_names.join(', ') + ')';
    } else {
      aoi_label = country_name + ' (All Level 2)';
    }
  } else {
    throw new Error('admin_level must be 0, 1, or 2');
  }

  AOIgeom = AOI.geometry();
  output_prefix = output_prefix + '_AdminLevel' + admin_level;
  print("Using GAUL admin boundaries:", aoi_label);
}

print("AOI feature count:", AOI.size());

// ======================================================================
// MAP STYLE
// ======================================================================

var AOIVis = AOI.style({
  color: "FF4500",
  width: 2,
  fillColor: "FFFFFF00"
});

Map.centerObject(AOIgeom, 7);
Map.addLayer(AOIVis, {}, aoi_label);

// ======================================================================
// CHIRPS DAILY RAINFALL
// ======================================================================

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .select('precipitation')
  .filterBounds(AOIgeom);

print("Study period:", study_start, "to", study_end);
print("Baseline period:", baseline_start_year, "to", baseline_end_year);

// 1. Total rainfall during study period
var chirps_study = chirps
  .filter(ee.Filter.date(study_start, study_end))
  .sum()
  .clip(AOIgeom);

Map.addLayer(chirps_study, {
  min: 50, max: 600,
  palette: ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d']
}, 'Total precipitation (Study period)');

// 2. Baseline rainfall (mean total for season across baseline years)
var chirps_mam = chirps.filter(ee.Filter.dayOfYear(doy_start, doy_end));
var years = ee.List.sequence(baseline_start_year, baseline_end_year);

var chirps_baseline = ee.ImageCollection.fromImages(
  years.map(function (y) {
    return chirps_mam
      .filter(ee.Filter.calendarRange(y, y, 'year'))
      .sum()
      .clip(AOIgeom)
      .set('year', y);
  })
).mean();

Map.addLayer(chirps_baseline, {
  min: 50, max: 600,
  palette: ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d']
}, 'Baseline avg precipitation (' + baseline_start_year + '–' + baseline_end_year + ')');

// 3. Rainfall anomaly
var baseline_masked = chirps_baseline.updateMask(chirps_study.mask());

var rainfall_anomaly = chirps_study
  .subtract(baseline_masked)
  .clip(AOIgeom);

var anomalyVis = {
  min: -300,
  max: 300,
  palette: ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7',
            '#e0e0e0',
            '#d1e5f0','#92c5de','#4393c3','#2166ac','#053061']
};

Map.addLayer(rainfall_anomaly, anomalyVis, 'Rainfall anomaly (Study vs Baseline)');

// ======================================================================
// SPATIAL REDUCERS — per admin unit
// ======================================================================

var reducers_all = ee.Reducer.mean()
  .combine(ee.Reducer.min(), null, true)
  .combine(ee.Reducer.max(), null, true)
  .combine(ee.Reducer.sum(), null, true);

var admin_stats = chirps_study.reduceRegions({
  collection: AOI,
  reducer: reducers_all,
  scale: 250
});

var admin_stats_clean = admin_stats.filter(ee.Filter.notNull(['mean']));

// Add centroid coordinates for labels/exports
var admin_stats_with_centroid = admin_stats_clean.map(function(f) {
  var centroid = f.geometry().centroid(1);
  var lon = centroid.coordinates().get(0);
  var lat = centroid.coordinates().get(1);
  return f.set({'longitude': lon, 'latitude': lat});
});

print("Admin stats:", admin_stats_with_centroid);

// Build export selectors based on level
var selectors = ['ADM0_NAME', 'longitude', 'latitude', 'mean', 'min', 'max', 'sum'];
if (admin_level === 1) {
  selectors = ['ADM0_NAME', 'ADM1_NAME', 'longitude', 'latitude', 'mean', 'min', 'max', 'sum'];
}
if (admin_level === 2) {
  selectors = ['ADM0_NAME', 'ADM1_NAME', 'ADM2_NAME', 'longitude', 'latitude', 'mean', 'min', 'max', 'sum'];
}

// ======================================================================
// EXPORTS
// ======================================================================

Export.image.toDrive({
  image: chirps_study,
  description: output_prefix + '_StudyPeriod',
  fileNamePrefix: output_prefix + '_StudyPeriod',
  region: AOIgeom,
  scale: 250,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: chirps_baseline,
  description: output_prefix + '_Baseline_' + baseline_start_year + '_' + baseline_end_year,
  fileNamePrefix: output_prefix + '_Baseline_' + baseline_start_year + '_' + baseline_end_year,
  region: AOIgeom,
  scale: 250,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: rainfall_anomaly,
  description: output_prefix + '_Anomaly',
  fileNamePrefix: output_prefix + '_Anomaly',
  region: AOIgeom,
  scale: 250,
  maxPixels: 1e13
});

Export.table.toDrive({
  collection: admin_stats_with_centroid,
  description: output_prefix + '_Admin_Stats',
  fileNamePrefix: output_prefix + '_Admin_Stats',
  fileFormat: 'CSV',
  selectors: selectors
});

// Optional: export admin boundaries
Export.table.toDrive({
  collection: AOI,
  description: output_prefix + '_Admin_Boundaries',
  fileNamePrefix: output_prefix + '_Admin_Boundaries',
  fileFormat: 'SHP'
});

print("All exports queued with prefix:", output_prefix);
