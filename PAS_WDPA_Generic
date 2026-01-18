// ======================================================================
// WDPA PROTECTED AREAS EXTRACTION — GENERIC GEE VERSION
// ======================================================================

// ======================================================================
// USER SETTINGS (edit these)
// ======================================================================

var country_name = 'Kenya';  // Change to your country

// CHOOSE AOI TYPE
var use_custom_aoi = false;  // Set to TRUE to use imported AOI, FALSE for entire country
// If use_custom_aoi = TRUE, make sure to import your AOI vector file in the Code Editor

// Output prefix (all exports will use this)
var output_prefix = 'WDPA_' + country_name;

// Protected area designations to include (leave empty [] for all)
var allowedDesigs = [
  'National Park',
  'National Reserve',
  'Forest Reserve',
  'Nature Reserve',
  'National Sanctuary',
  'Wildlife Sanctuary',
  'UNESCO-MAB Biosphere Reserve'
  // Add or remove designations as needed. Leave empty to include ALL
];

// ======================================================================
// LOAD AOI (Country or Custom - imported via Imports panel)
// ======================================================================

var AOI;
var AOIgeom;
var aoi_label;

if (use_custom_aoi) {
  // Use the imported AOI variable (you must import it in the Code Editor Imports panel first)
  AOI = AOI;  // This references the imported variable from Imports
  AOIgeom = AOI.geometry ? AOI.geometry() : AOI;
  aoi_label = 'Custom AOI (imported)';
  output_prefix = output_prefix + '_CustomAOI';
  print("Using custom AOI from Imports panel");
} else {
  // Load country boundary (LSIB dataset)
  AOI = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
    .filter(ee.Filter.eq('country_na', country_name));
  AOIgeom = AOI.geometry();
  aoi_label = country_name + ' (entire country)';
  output_prefix = output_prefix + '_Country';
  print("Using entire country:", country_name);
}

// ======================================================================
// LOAD WDPA PROTECTED AREAS (from GEE dataset)
// ======================================================================

// Load all WDPA polygons and points
var PA_polygons_raw = ee.FeatureCollection("WCMC/WDPA/current/polygons");
var PA_points_raw = ee.FeatureCollection("WCMC/WDPA/current/points"); // to include smaller PA's or PA's without polygon. Can be point location of significance (e.g. small sanctuaries, underwater sites)

print("Loaded WDPA polygons and points from GEE dataset");

// ======================================================================
// FILTER BY COUNTRY & AOI
// ======================================================================

// Filter polygons by country and AOI
var PA_polygons = PA_polygons_raw
  .map(function(f) {
    return f.set('intersects', f.geometry().intersects(AOIgeom, 1));
  })
  .filter(ee.Filter.eq('intersects', true));

// Filter points by country and AOI
var PA_points = PA_points_raw
  .map(function(f) {
    return f.set('intersects', f.geometry().intersects(AOIgeom, 1));
  })
  .filter(ee.Filter.eq('intersects', true));

// Apply designation filter if specified
if (allowedDesigs.length > 0) {
  PA_polygons = PA_polygons.filter(ee.Filter.inList('DESIG_ENG', allowedDesigs));
  PA_points = PA_points.filter(ee.Filter.inList('DESIG_ENG', allowedDesigs));
}

print("PA Polygons in", aoi_label + ":", PA_polygons.size());
print("PA Points in", aoi_label + ":", PA_points.size());

// ======================================================================
// SELECT & PREPARE COLUMNS OF INTEREST
// ======================================================================

var columns_to_keep = ['NAME_ENG', 'DESIG_ENG', 'GIS_AREA', 'GOV_TYPE', 'OWN_TYPE']; //adjust

// Select columns for polygons
var PA_polygons_selected = PA_polygons.select(columns_to_keep);

// Select columns for points
var PA_points_selected = PA_points.select(columns_to_keep);

print("Selected columns:", columns_to_keep);

// ======================================================================
// STYLING
// ======================================================================

var AOIVis = AOI.style({
  color: "FF4500",
  width: 2,
  fillColor: "FFFFFF00"
});

var PA_polygons_Vis = PA_polygons_selected.style({
  color: "2F4F4F",
  width: 1,
  fillColor: "90EE9022"
});

var PA_points_Vis = PA_points_selected.style({
  color: "DC143C",
  width: 2
});

// ======================================================================
// ADD TO MAP
// ======================================================================

Map.centerObject(AOIgeom, 6);

Map.addLayer(AOIVis, {}, aoi_label + " (boundary)");
Map.addLayer(PA_polygons_Vis, {}, 'PA Polygons (' + PA_polygons.size().getInfo() + ')');
Map.addLayer(PA_points_Vis, {}, 'PA Points (' + PA_points.size().getInfo() + ')');

// ======================================================================
// SUMMARY STATISTICS
// ======================================================================

var total_pa_count = PA_polygons.size().add(PA_points.size());

print("\n=== SUMMARY STATISTICS ===");
print("Total PAs (Polygons + Points):", total_pa_count);

// Statistics by designation
var stats_by_desig = PA_polygons_selected
  .map(function(f) {
    return ee.Feature(null, {
      'DESIG_ENG': f.get('DESIG_ENG'),
      'count': 1
    });
  });

print("\nPA count by designation:");
print(PA_polygons_selected.aggregate_histogram('DESIG_ENG'));

// Statistics by governance type
print("\nPA count by governance type:");
print(PA_polygons_selected.aggregate_histogram('GOV_TYPE'));

// ======================================================================
// RASTERIZE PROTECTED AREAS (Binary: 1 = Protected, 0 = Not Protected)
// ======================================================================

// Create a binary raster (1 = within PA, 0 = not within PA)
// Resolution: 1 km (adjust as needed)

var PA_raster_binary = ee.Image(0).byte()
  .paint(PA_polygons_selected, 1)
  .reproject({
    crs: 'EPSG:4326',
    scale: 100  // // 100 meter resolution - if smaller AOI set to 30m to match Landsat resolution
  })
  .clip(AOIgeom);

Map.addLayer(
  PA_raster_binary,
  {min: 0, max: 1, palette: ['white', 'darkgreen']},
  'PA Binary Raster (1km resolution)'
);

// ======================================================================
// RASTERIZE BY GIS_AREA (Area-weighted raster)
// ======================================================================

// Rasterize with area values (area of PA in each pixel)
var PA_raster_area = ee.Image(0).double()
  .paint(PA_polygons_selected, 'GIS_AREA')
  .reproject({
    crs: 'EPSG:4326', // best choise CRS in GEE - reproject in e.g. QGIS
    scale: 100  // 100 meter resolution - if smaller AOI set to 30m to match Landsat resolution
  })
  .clip(AOIgeom);

Map.addLayer(
  PA_raster_area,
  {min: 0, max: 1e10, palette: ['white', 'yellow', 'orange', 'red']},
  'PA Area Raster (GIS_AREA, 1km resolution)'
);

// ======================================================================
// EXPORTS TO GOOGLE DRIVE
// ======================================================================

// Export PA Polygons as shapefile
Export.table.toDrive({
  collection: PA_polygons_selected,
  description: output_prefix + '_Polygons',
  fileNamePrefix: output_prefix + '_Polygons',
  fileFormat: 'SHP'
});

// Export PA Points as shapefile
Export.table.toDrive({
  collection: PA_points_selected,
  description: output_prefix + '_Points',
  fileNamePrefix: output_prefix + '_Points',
  fileFormat: 'SHP'
});

// Export binary raster (1 = PA, 0 = not PA)
Export.image.toDrive({
  image: PA_raster_binary.uint8(),
  description: output_prefix + '_Raster_Binary',
  fileNamePrefix: output_prefix + '_Raster_Binary',
  region: AOIgeom,
  scale: 100,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

// Export area-weighted raster
Export.image.toDrive({
  image: PA_raster_area,
  description: output_prefix + '_Raster_Area',
  fileNamePrefix: output_prefix + '_Raster_Area',
  region: AOIgeom,
  scale: 100,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326'
});

// Export summary stats as table
var summary_table = ee.FeatureCollection([
  ee.Feature(null, {
    'Metric': 'Total_PA_Polygons',
    'Value': PA_polygons.size()
  }),
  ee.Feature(null, {
    'Metric': 'Total_PA_Points',
    'Value': PA_points.size()
  }),
  ee.Feature(null, {
    'Metric': 'Total_PAs',
    'Value': total_pa_count
  })
]);

Export.table.toDrive({
  collection: summary_table,
  description: output_prefix + '_Summary_Stats',
  fileNamePrefix: output_prefix + '_Summary_Stats',
  fileFormat: 'CSV'
});

print("\n=== ALL EXPORTS QUEUED ===");
print("Prefix:", output_prefix);
print("Exports will appear in Google Drive");
