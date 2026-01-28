// ======================================================
// SRTM/NASADEM ELEVATION ANALYSIS — GENERIC VERSION
// ======================================================

// DATASET OPTION (switch as needed)
// NASADEM (recommended): "NASA/NASADEM_HGT/001"
// SRTM v3 (30m):        "USGS/SRTMGL1_003"
// SRTM v4 (if available in GEE): check catalog for exact ID

// ======================================================
// ---- USER SETTINGS (edit these) ----
// ======================================================
var country_name = 'Spain';  // Change to your country
var output_prefix = 'DEM_Elevation';  // Prefix for all exports
var stats_description = 'AOI stats elevation';
var percentiles_description = 'AOI percentiles elevation';

// ======================================================
// LOAD DATA
// ======================================================

// Load country boundary (LSIB dataset)
var country = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', country_name))
  .geometry();

// Load SRTM elevation data
var dem = ee.Image("NASA/NASADEM_HGT/001").select('elevation');

// Import AOI (must be imported in Code Editor as "AOI")

var AOI_geometry = AOI.geometry ? AOI.geometry() : AOI;

print('Country:', country_name);
print('AOI loaded:', AOI_geometry);

// ======================================================
// VISUALIZATION
// ======================================================

var AOIVis = AOI.style({color: "FF4500", width: 3, fillColor: "FFFFFF00"});
Map.addLayer(AOIVis, null, "AOI_boundary");
Map.centerObject(AOI_geometry, 6);

// Define visualization parameters
var demVis = {
  min: 0,
  max: 3000,
  palette: ['blue', 'green', 'yellow', 'orange', 'red']
};

var dem_AOI = dem.clip(AOI_geometry);
var dem_country = dem.clip(country);

Map.addLayer(dem_AOI, demVis, 'AOI Elevation');
Map.addLayer(dem_country, demVis, country_name + ' DEM');

// ======================================================
// HISTOGRAM
// ======================================================
var histogram = ui.Chart.image.histogram({
  image: dem_AOI,
  region: AOI_geometry,
  scale: 50,
  minBucketWidth: 50
});
histogram.setOptions({
  title: 'Histogram of Elevation in ' + country_name + ' AOI (meters)'
});

print(histogram);

// ======================================================
// SPATIAL REDUCERS — MEAN, MIN, MAX
// ======================================================
var reducers_all = ee.Reducer.mean()
  .combine(ee.Reducer.min(), null, true)
  .combine(ee.Reducer.max(), null, true);

var AOI_stats = dem_AOI.reduceRegions({
  collection: AOI,
  reducer: reducers_all,
  scale: 30
});

// Remove empty rows
var AOI_stats_clean = AOI_stats.filter(ee.Filter.notNull(['mean']));
print("AOI Stats (mean, min, max):", AOI_stats_clean);

// ======================================================
// SPATIAL REDUCERS — PERCENTILES [50, 95]
// ======================================================
var percentiles = ee.Reducer.percentile([50, 95]);

var AOI_percentiles = dem_AOI.reduceRegions({
  collection: AOI,
  reducer: percentiles,
  scale: 30
});

// Remove empty rows
var AOI_percentiles_clean = AOI_percentiles.filter(
  ee.Filter.notNull(['p50'])
);
print("AOI Percentiles (p50, p95):", AOI_percentiles_clean);

// ======================================================
// EXPORTS (using output_prefix)
// ======================================================

// Export AOI elevation raster
Export.image.toDrive({
  image: dem_AOI,
  description: output_prefix + '_AOI',
  fileNamePrefix: output_prefix + '_AOI',
  region: AOI_geometry,
  scale: 30,                  // NASADEM/SRTM native resolution
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326', 
  formatOptions: {cloudOptimized: true}
});

// Export country elevation raster
Export.image.toDrive({
  image: dem_country,
  description: output_prefix + '_' + country_name,
  fileNamePrefix: output_prefix + '_' + country_name,
  region: country,
  scale: 30,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326', 
  formatOptions: {cloudOptimized: true}
});

// Export statistics CSV
Export.table.toDrive({
  collection: AOI_stats_clean,
  description: stats_description,
  fileFormat: 'CSV',
  selectors: ['mean', 'min', 'max']
});

// Export percentiles CSV
Export.table.toDrive({
  collection: AOI_percentiles_clean,
  description: percentiles_description,
  fileFormat: 'CSV',
  selectors: ['p50', 'p95']
});

print("All exports queued!");
