import { CSWRecordModel } from '../../model/data/cswrecord.model';
import { Injectable, Inject } from '@angular/core';
import olExtent from 'ol/extent';
import olLayerVector from 'ol/layer/vector';
import olLayer from 'ol/layer/layer';
import olFeature from 'ol/feature';
import olProj from 'ol/proj';
import { BehaviorSubject,  Subject } from 'rxjs';
import { point } from '@turf/helpers';
import * as inside from '@turf/inside';
import * as bboxPolygon from '@turf/bbox-polygon';
import { LayerModel } from '../../model/data/layer.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { ManageStateService } from '../permanentlink/manage-state.service';
import { OlCSWService } from '../wcsw/ol-csw.service';
import { OlWFSService } from '../wfs/ol-wfs.service';
import { OlMapObject } from './ol-map-object';
import { OlWMSService } from '../wms/ol-wms.service';
import { OlWWWService } from '../www/ol-www.service';



/**
 * Wrapper class to provide all things related to the ol map such as adding layer or removing layer.
 */
@Injectable()
export class OlMapService {

   // VT: a storage to keep track of the layers that have been added to the map. This is use to handle click events.
   private layerModelList: { [key: string]: LayerModel; } = {};
   private addLayerSubject: Subject<LayerModel>;

   private clickedLayerListBS = new BehaviorSubject<any>({});

   constructor(private layerHandlerService: LayerHandlerService, private olWMSService: OlWMSService,
     private olWFSService: OlWFSService, private olMapObject: OlMapObject, private manageStateService: ManageStateService, @Inject('env') private env,
      private olCSWService: OlCSWService, private olWWWService: OlWWWService) {

     this.olMapObject.registerClickHandler(this.mapClickHandler.bind(this));
     this.addLayerSubject = new Subject<LayerModel>();
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
              // LJ: skip the olFeature
              if (feature.get('bClipboardVector')) {
                return;
              }
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
   
  /*
   * Return a list of CSWRecordModels present in active layers that intersect
   * the supplied extent
   *
   * @param extent the extent with which to test the intersection of CSW
   * records
   */
  public getCSWRecordsForExtent(extent: olExtent): CSWRecordModel[] {
    let intersectedCSWRecordList: CSWRecordModel[] = [];
    extent = olProj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');    
    const activeLayers = this.olMapObject.getLayers();    
    const map = this.olMapObject.getMap();
    const mapLayerColl = map.getLayers();
    const me = this;
    mapLayerColl.forEach(function(layer) {
       for (const layerId in activeLayers) {
           for (const activeLayer of activeLayers[layerId]) {
               if (layer === activeLayer) {
                   const layerModel = me.getLayerModel(layerId);
                   /*
                   if (!layerModel || !me.layerHandlerService.containsWMS(layerModel)) {
                      continue;
                   }
                   */
                   for (const cswRecord of layerModel.cswRecords) {
                       let cswRecordIntersects: boolean = false;
                       for (const bbox of cswRecord.geographicElements) {
                           const tBbox = [bbox.westBoundLongitude, bbox.southBoundLatitude, bbox.eastBoundLongitude, bbox.northBoundLatitude];
                           if(olExtent.intersects(extent, tBbox)) {
                               cswRecordIntersects = true;
                           }
                       }
                       if(cswRecordIntersects) {
                           intersectedCSWRecordList.push(cswRecord);
                       }
                   }
               }
           }
        }
     });
     
     return intersectedCSWRecordList;
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
       this.cacheLayerModelList(layer.id, layer);
     } else if (this.layerHandlerService.containsWMS(layer)) {
       this.olWMSService.addLayer(layer, param);
       this.cacheLayerModelList(layer.id, layer);
     } else if (this.layerHandlerService.containsWFS(layer)) {
       this.olWFSService.addLayer(layer, param);
       this.layerModelList[layer.id] = layer;
     } else if (this.layerHandlerService.containsWWW(layer)) {
       this.olWWWService.addLayer(layer, param);
       this.layerModelList[layer.id] = layer;
     } else {
       throw new Error('No Suitable service found');
     }
   }

   private cacheLayerModelList(id: string, layer: LayerModel) {
     this.layerModelList[layer.id] = layer;
     this.addLayerSubject.next(layer);
   }

   /**
    *  In the event we have custom layer that is handled outside olMapService, we will want to register that layer here so that
    *  it can be handled by the clicked event handler.
    *  this is to support custom layer renderer such as iris that uses kml
    */
   public appendToLayerModelList(layer) {
     this.cacheLayerModelList(layer.id, layer);
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
        try {
            this.addLayer(itemLayer, {});
        } catch(error) {
            throw error;
        }
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
  
  /*
   * Set the layer hidden property
   */
  public setLayerVisibility(layerId: string, visible: boolean) {
    this.layerModelList[layerId].hidden = !visible;
    this.olMapObject.setLayerVisibility(layerId, visible);
  }

  /**
   * Set the opacity of a layer
   * @param layerId the ID of the layer to change opacity
   * @param opacity the value of opacity between 0.0 and 1.0
   */
  public setLayerOpacity(layerId: string, opacity: number) {
    this.olMapObject.setLayerOpacity(layerId, opacity);
  }

  /**
   * Retrieve the active layer list
   */
  public getLayerModelList(): { [key: string]: LayerModel; } {
    return this.layerModelList;
  }
   
  public getAddLayerSubject(): Subject<LayerModel> {
    return this.addLayerSubject;
  }

  /**
   * Fit the map to the extent that is provided
   * @param extent An array of numbers representing an extent: [minx, miny, maxx, maxy]
   */
  public fitView(extent: [number, number, number, number]): void {
      this.olMapObject.getMap().getView().fit(extent);
  }
  
  /**
   * Zoom the map in one level
   */
  public zoomMapIn(): void {
    this.olMapObject.zoomIn();
  }
  
  /**
   * Zoom the map out one level
   */
  public zoomMapOut(): void {
    this.olMapObject.zoomOut();
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
  public getMapExtent(): olExtent {
    return this.olMapObject.getMapExtent();
  }
  
  /**
   * Draw an extent on the map object
   * @param extent the extent to display on the map
   * @param duration (Optional) the length of time in milliseconds to display the extent before it is removed. If not supplied the extent will not be removed.
   */
  public displayExtent(extent: olExtent, duration?: number) {
    this.olMapObject.displayExtent(extent, duration);
  }

  /**
   * Call updateSize on map to handle scale changes
   */   
  public updateSize() {
    this.olMapObject.updateSize();
  }
  
  /**
   * Change the OL Map's basemap
   * @param baseMap the basemap's ID value (string)
   */
  public switchBaseMap(baseMap: string) {
    this.olMapObject.switchBaseMap(baseMap);
  }

}
