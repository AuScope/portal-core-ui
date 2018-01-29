
import { CSWRecordModel } from '../../model/data/cswrecord.model';
import { Injectable, Inject, SkipSelf } from '@angular/core';
import {LayerModel} from '../../model/data/layer.model';
import { OnlineResourceModel } from '../../model/data/onlineresource.model';
import { PrimitiveModel } from '../../model/data/primitive.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { OlMapObject } from '../openlayermap/ol-map-object';
import {HttpClient, HttpParams} from '@angular/common/http';
import { Headers, RequestOptions } from '@angular/http';
import olMap from 'ol/map';
import olPoint from 'ol/geom/point';
import olPolygon from 'ol/geom/polygon';
import olProj from 'ol/proj';
import olFeature from 'ol/feature';
import olStyle from 'ol/style/style';
import olIcon from 'ol/style/icon';
import olLayerVector from 'ol/layer/vector';
import olSourceVector from 'ol/source/vector';
import olStyleStroke from 'ol/style/stroke';
import olStyleFill from 'ol/style/fill';
import { Observable } from 'rxjs/Rx';
import { GMLParserService } from '../../utility/gmlparser.service';
import { Constants } from '../../utility/constants.service';
import { UtilitiesService } from '../../utility/utilities.service';
import { RenderStatusService } from '../openlayermap/renderstatus/render-status.service';

/**
 * Use OlMapService to add layer to map. This service class adds wfs layer to the map
 */
@Injectable()
export class OlCSWService {

  private map: olMap;

  constructor(private layerHandlerService: LayerHandlerService,
                  private olMapObject: OlMapObject,
                  private http: HttpClient,
                  private renderStatusService: RenderStatusService) {
    this.map = this.olMapObject.getMap();
  }


  /**
   * Add geometry type point to the map
   * @param layer the layer where this point derived from
   * @param primitive the point primitive
   */
  public addPoint(layer: LayerModel, cswRecord: CSWRecordModel, primitive: PrimitiveModel): void {
     const geom = new olPoint(olProj.transform([primitive.coords.lng, primitive.coords.lat], (primitive.srsName ? primitive.srsName : 'EPSG:4326'), 'EPSG:3857'));
       const feature = new olFeature(geom);
       feature.setStyle([
          new olStyle({
             image: new olIcon(({
                     anchor: [0.5, 1],
                     anchorXUnits: 'fraction',
                     anchorYUnits: 'fraction',
                     // size: [32, 32],
                     scale: 0.5,
                     opacity: 1,
                     src: layer.iconUrl
           }))
          })
       ]);

       if (primitive.name) {
         feature.setId(primitive.name);
       }
       feature.cswRecord = cswRecord;
       feature.layer = layer;
    // VT: we chose the first layer in the array based on the assumption that we only create a single vector
    // layer for each wfs layer. WMS may potentially contain more than 1 layer in the array. note the difference
    (<olLayerVector>this.olMapObject.getLayerById(layer.id)[0]).getSource().addFeature(feature);
  }

  public addLine(primitive: PrimitiveModel): void {

  }

  public addPoloygon(layer: LayerModel, cswRecord: CSWRecordModel, primitive: PrimitiveModel): void {

    const feature = new olFeature({
      geometry: new olPolygon([primitive.coords])
    });

    feature.getGeometry().transform((primitive.srsName ? primitive.srsName : 'EPSG:4326'), 'EPSG:3857');

    feature.setStyle([
      new olStyle({
        stroke: new olStyleStroke({
          color: 'blue',
          width: 3
        }),
        fill: new olStyleFill({
          color: 'rgba(0, 0, 255, 0.1)'
        })
      })
    ]);

    if (primitive.name) {
      feature.setId(primitive.name);
    }
    feature.cswRecord = cswRecord;
    feature.layer = layer;

    (<olLayerVector>this.olMapObject.getLayerById(layer.id)[0]).getSource().addFeature(feature);

  }

  /**
   * Add the csw layer
   * @param layer the layer to add to the map
   * @param the wfs layer to be added to the map
   */
  public addLayer(layer: LayerModel, param?: any): void {
    const cswRecords = this.layerHandlerService.getCSWRecord(layer);

    // VT: create the vector on the map if it does not exist.
    if (!this.olMapObject.getLayerById(layer.id)) {
        const markerLayer = new olLayerVector({
                    source: new olSourceVector({ features: []})
                });

        this.olMapObject.addLayerById(markerLayer, layer.id);
    }
    const onlineResource = new OnlineResourceModel();
    onlineResource.url = 'Not applicable, rendering from csw records';
    this.renderStatusService.addResource(layer, onlineResource);
    for (const cswRecord of cswRecords) {
      // VT do some filter based on the parameter here

      const primitive = new PrimitiveModel();

      const geoEls = cswRecord.geographicElements;
      for (let j = 0; j < geoEls.length; j++) {
        const geoEl = geoEls[j];
        if (geoEl.eastBoundLongitude && geoEl.westBoundLongitude && geoEl.southBoundLatitude && geoEl.northBoundLatitude) {
          const primitive = new PrimitiveModel();
          if (geoEl.eastBoundLongitude === geoEl.westBoundLongitude &&
            geoEl.southBoundLatitude === geoEl.northBoundLatitude) {


            primitive.geometryType = Constants.geometryType.POINT;
            primitive.name = cswRecord.name;
            primitive.coords = {
              lng: geoEl.eastBoundLongitude,
              lat: geoEl.southBoundLatitude
            };
          } else {
            primitive.geometryType = Constants.geometryType.POLYGON;
            primitive.name = cswRecord.name;
            primitive.coords = [[geoEl.eastBoundLongitude, geoEl.northBoundLatitude], [geoEl.westBoundLongitude, geoEl.northBoundLatitude],
              [geoEl.westBoundLongitude, geoEl.southBoundLatitude], [geoEl.eastBoundLongitude, geoEl.southBoundLatitude]];
          }

          switch (primitive.geometryType) {
            case Constants.geometryType.POINT:
              this.addPoint(layer, cswRecord, primitive);
              break;
            case Constants.geometryType.POLYGON:
              this.addPoloygon(layer, cswRecord, primitive);
              break;
          }


        }
      }

    }
    this.renderStatusService.updateComplete(layer, onlineResource);
  }



}
