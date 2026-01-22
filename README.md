# RS-Conservation-GEE

Google Earth Engine (JavaScript) scripts for conservation remote sensing workflows.

## Generic scripts
- `admin_boundaries_gaul_generic.js` – FAO GAUL admin boundaries with labels + exports.
- `chirps_rainfall_aoi_pa_generic.js` – CHIRPS rainfall totals, baseline, anomalies, AOI + PA stats.
- `gfc_hansen_forest_change_generic.js` – Hansen GFC forest change metrics and exports.
- `gsw_occurrence_change_generic.js` – JRC GSW occurrence/change/transition summaries + exports.
- `nasadem_elevation_stats_generic.js` – NASADEM/SRTM elevation stats, percentiles, and exports.
- `ndvi_anomalies_landsat_generic.js` – Landsat NDVI anomalies (monthly + mean).
- `wdpa_protected_areas_generic.js` – WDPA extraction + rasterization + exports.

## Archived examples (project-specific)
- `archive/chirps_rainfall_kenya_pa_example.js`
- `archive/gsw_change_transition_example.js`
- `archive/ndvi_anomalies_example.js`
- `archive/s2_mask_filter_ndvi_example.js`
- `archive/srtm_elevation_aoi_example.js`

## Usage
- Open a script in the GEE Code Editor.
- Import your AOI as `AOI` (if required).
- Update country names and dates, then run.
- Exports go to Google Drive.

## Notes
- Paths are not used in GEE; exports are controlled by `Export.*`.
- Scale settings affect output size and runtime.

## License
MIT (or your preferred license)
