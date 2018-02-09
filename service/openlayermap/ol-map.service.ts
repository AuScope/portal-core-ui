
import { CSWRecordModel } from '../../model/data/cswrecord.model';
import { Injectable, Inject } from '@angular/core';
import olLayerVector from 'ol/layer/vector';
import olLayer from 'ol/layer/layer';
import olFeature from 'ol/feature';
import olRenderFeature from 'ol/render/feature';
import olProj from 'ol/proj';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import { point, polygon } from '@turf/helpers';
import * as inside from '@turf/inside';
import * as bbox from '@turf/bbox';
import * as bboxPolygon from '@turf/bbox-polygon';
import {LayerModel} from '../../model/data/layer.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { ManageStateService } from '../permanentlink/manage-state.service';
import { OlCSWService } from '../wcsw/ol-csw.service';
import { OlWFSService } from '../wfs/ol-wfs.service';
import { OlMapObject } from './ol-map-object';
import { OlWMSService } from '../wms/ol-wms.service';
import { Subject } from 'rxjs/Subject';



/**
 * Wrapper class to provide all things related to the ol map such as adding layer or removing layer.
 */
@Injectable()
export class OlMapService {

   // VT: a storage to keep track of the layers that have been added to the map. This is use to handle click events.
   private layerModelList: { [key: string]: LayerModel; } = {};

   private clickedLayerListBS = new BehaviorSubject<any>({});

   constructor(private layerHandlerService: LayerHandlerService, private olWMSService: OlWMSService,
     private olWFSService: OlWFSService, private olMapObject: OlMapObject, private manageStateService: ManageStateService, @Inject('env') private env,
      private olCSWService: OlCSWService) {

     this.olMapObject.registerClickHandler(this.mapClickHandler.bind(this));
   }

  /**
   * get a observable subject that triggers an event whenever a map is clicked on
   * @returns the observable subject that returns the list of map layers that was clicked on in the format {clickedFeatureList,
   *         clickedLayerList, pixel,clickCoord}
   */
   public getClickedLayerListBS(): BehaviorSubject<any> {
     return this.clickedLayerListBS;
   }

   /**
    * Gets called when a map click event is recognised
    * @param pixel coordinates of clicked on pixel (units: pixels)
    */
   public mapClickHandler(pixel: number[]) {
      try {
           // Convert pixel coords to map coords
           const map = this.olMapObject.getMap();
           const clickCoord = map.getCoordinateFromPixel(pixel);
           const lonlat = olProj.transform(clickCoord, 'EPSG:3857', 'EPSG:4326');
           const clickPoint = point(lonlat);

           // Compile a list of clicked on layers
           // NOTO BENE: forEachLayerAtPixel() cannot be used because it causes CORS problems
           const activeLayers = this.olMapObject.getLayers();
           const clickedLayerList: olLayer[] = [];
           const layerColl = map.getLayers();
           const me = this;
           layerColl.forEach(function(layer) {
               for (const layerId in activeLayers) {
                   for (const activeLayer of activeLayers[layerId]) {
                       if (layer === activeLayer) {
                           const layerModel = me.getLayerModel(layerId);
                           if (!this.layerHandlerService.containsWMS(layerModel)) {
                             continue;
                           }
                           for (const cswRecord of layerModel.cswRecords) {
                               for (const bbox of cswRecord.geographicElements) {
                                   const tBbox = [bbox.eastBoundLongitude, bbox.southBoundLatitude, bbox.westBoundLongitude, bbox.northBoundLatitude];
                                   const poly = bboxPolygon(tBbox);
                                   if (inside(clickPoint, poly) && !clickedLayerList.includes(activeLayer)) {
                                     // Add to list of clicked layers
                                     clickedLayerList.push(activeLayer);
                                   }
                               }
                           }
                       }
                   }
               }
           }, me);

           // Compile a list of clicked on features
           const clickedFeatureList: olFeature[] = [];
           const featureHit = map.forEachFeatureAtPixel(pixel, function(feature) {
               clickedFeatureList.push(feature);
           });

           this.clickedLayerListBS.next({
             clickedFeatureList: clickedFeatureList,
             clickedLayerList: clickedLayerList,
             pixel: pixel,
             clickCoord: clickCoord
           });
      } catch (error) {
        throw error;
      }
   }



  /**
   * Add layer to the wms
   * @param layer the layer to add to the map
   */
   public addLayer(layer: LayerModel, param: any): void {
     this.olMapObject.removeLayerById(layer.id);
     delete this.layerModelList[layer.id];
     if (this.env.cswrenderer && this.env.cswrenderer.includes(layer.id)) {
       this.olCSWService.addLayer(layer, param);
       this.layerModelList[layer.id] = layer;
     } else if (this.layerHandlerService.containsWMS(layer)) {
       this.olWMSService.addLayer(layer, param);
       this.layerModelList[layer.id] = layer;
     } else if (this.layerHandlerService.containsWFS(layer)) {
       this.olWFSService.addLayer(layer, param);
       this.layerModelList[layer.id] = layer;
     } else {
       throw new Error('No Suitable service found');
     }
   }

   /**
    *  In the event we have custom layer that is handled outside olMapService, we will want to register that layer here so that
    *  it can be handled by the clicked event handler.
    */
   public appendToLayerModelList(layer) {
     this.layerModelList[layer.id] = layer;
   }

  /**
   * Add layer to the map. taking a short cut by wrapping the csw in a layerModel
   * @param layer the layer to add to the map
   */
   public addCSWRecord(cswRecord: CSWRecordModel): void {
        const itemLayer = new LayerModel();
        itemLayer.cswRecords = [cswRecord];
        itemLayer['expanded'] = false;
        itemLayer.id = cswRecord.id;
        itemLayer.description = cswRecord.description;
        itemLayer.hidden = false;
        itemLayer.layerMode = 'NA';
        itemLayer.name = cswRecord.name;
       this.addLayer(itemLayer, {});
   }

  /**
   * Remove layer from map
   * @param layer the layer to remove from the map
   */
  public removeLayer(layer: LayerModel): void {
      this.manageStateService.removeLayer(layer.id);
      this.olMapObject.removeLayerById(layer.id);
      delete this.layerModelList[layer.id];
  }

  /**
   * Retrieve the layer model given an id string
   * @param layerId layer's id string
   */
  public getLayerModel(layerId: string): LayerModel {
      if (this.layerModelList.hasOwnProperty(layerId)) {
          return this.layerModelList[layerId];
      }
      return null;
  }
  
  /**
   * Check if the layer denoted by layerId has been added to the map
   * @param layerId the ID of the layer to check for
   */
  public layerExists(layerId: string): boolean {
    if (layerId in this.layerModelList)
      return true;
    else return false;
  }

  /**
   * Fit the map to the extent that is provided
   * @param extent An array of numbers representing an extent: [minx, miny, maxx, maxy]
   */
  public fitView(extent: [number, number, number, number]): void {
      this.olMapObject.getMap().getView().fit(extent);
  }

  /**
   * DrawBound
   * @returns a observable object that triggers an event when the user have completed the task
   */
  public drawBound(): Subject<olLayerVector> {
    return this.olMapObject.drawBox();
  }

  /**
    * Method for drawing a dot on the map.
    * @returns the layer vector on which the dot is drawn on. This provides a handle for the dot to be deleted
    */
  public drawDot(coord): olLayerVector {
    return this.olMapObject.drawDot(coord);
  }

  /**
  * Method for drawing a polygon on the map.
  * @returns the polygon coordinates string BS on which the polygon is drawn on.
  */
  public drawPolygon(): BehaviorSubject<olLayerVector> {
    return this.olMapObject.drawPolygon();
  }

  /**
   * remove a vector layer from the map
   * @param the vector layer to be removed
   */
  public removeVector(vector: olLayerVector) {
    this.olMapObject.removeVector(vector);
  }
  
  /**
   * Return the extent of the overall map
   * @returns the map extent
   */
  getMapExtent(): olExtent {
      return this.olMapObject.getMapExtent();
  }


  /**
   * Draw an extent on the map object
   * @param extent the extent to display on the map
   */
  public displayExtent(extent: olExtent) {
      this.olMapObject.displayExtent(extent);
  }

}
