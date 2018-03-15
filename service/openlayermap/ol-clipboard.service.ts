import {Injectable, Inject} from '@angular/core';
import olObservable from 'ol/observable';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import olProj from 'ol/proj';
import * as simplifyjs from 'simplify';
import { OlMapObject } from './ol-map-object';
import olLayerVector from 'ol/layer/vector';

/**
 * A wrapper around the clipboard object for use in the portal.
 */
@Injectable()
export class OlClipboardService {
  private polygonBBoxs: Polygon[];
  public polygonsBS: BehaviorSubject<Polygon[]>;

  public vectorOnMap: olLayerVector;

  private bShowClipboard: Boolean = false;
  public clipboardBS = new BehaviorSubject<Boolean>(this.bShowClipboard);

  private bFilterLayers: Boolean = false;
  public filterLayersBS = new BehaviorSubject<Boolean>(this.bFilterLayers);

  constructor(private olMapObject: OlMapObject) {
    this.vectorOnMap = null;
    this.polygonBBoxs = [];
    this.polygonsBS = new BehaviorSubject<Polygon[]>(this.polygonBBoxs);
    this.polygonsBS.next(this.polygonBBoxs);

  }

  public toggleClipboard() {
    this.bShowClipboard = !this.bShowClipboard ;
    this.clipboardBS.next(this.bShowClipboard );
  }

  public toggleFilterLayers() {
    this.bFilterLayers = !this.bFilterLayers ;
    this.filterLayersBS.next(this.bFilterLayers );
  }
  /**
  * Method for drawing a polygon on the map.
  * @returns the polygon coordinates string BS on which the polygon is drawn on.
  */
  public drawPolygon() {
    this.olMapObject.drawPolygon().subscribe(
        (vector) => {
          const coords = vector.get('polygonString');
          if ( coords ) {
            const newPolygon = {name: 'manual-' + Math.floor(Math.random() * 1000), srs: 'EPSG:3857', coordinates: coords, olvector: vector};
            this.polygonBBoxs.push(newPolygon);
            this.polygonsBS.next(this.polygonBBoxs);
            console.log('drawPolygon' + newPolygon.name + ':' + newPolygon.coordinates);
            if (this.vectorOnMap) {
              this.olMapObject.removeVector(this.vectorOnMap);
            }
            this.vectorOnMap = vector;
          }
      });
  }
  public renderPolygon() {
    if (this.vectorOnMap) {
      this.olMapObject.removeVector(this.vectorOnMap);
    }
    if (this.polygonBBoxs.length) {
      this.olMapObject.renderPolygon(this.polygonBBoxs[0]).subscribe(
        (vector) => {
          this.vectorOnMap = vector;
        });
    }
  }

  public addPolygon(newPolygon: Polygon) {
    for (const polygon of this.polygonBBoxs) {
      if (typeof polygon !== 'undefined' && polygon.name === newPolygon.name) {
        return;
      }
    }
    const coordsArray = newPolygon.coordinates.split(' ');
    const coords = [];
    // transform from 'EPSG:4326'to 'EPSG:3857' format
    console.log('addPolygon:srs:', newPolygon.srs);
    for (let i = 0; i < coordsArray.length; i += 2) {
      const point = olProj.transform([parseFloat(coordsArray[i]), parseFloat(coordsArray[i + 1])], newPolygon.srs , 'EPSG:3857');
      coords.push({'x': point[0], 'y': point[1]});
    }
    newPolygon.srs = 'EPSG:3857';
    // simplify process
    const simpleCoords = this.simplifyTo(coords, 100);
    const newCoords = [];
    for (const coord of simpleCoords) {
      newCoords.push(coord.x + ',' + coord.y);
    }
    // make newPolygon
    const newPolygonString = newCoords.join(' ');
    newPolygon.coordinates = newPolygonString;
    // save the newPolygon to polygonsBS
    this.polygonBBoxs.push(newPolygon);
    this.polygonsBS.next(this.polygonBBoxs);
  }

  public removePolygon() {
    this.polygonsBS.next(this.polygonBBoxs);
  }

  public clearClipboard() {
    this.polygonBBoxs = [];
    this.polygonsBS.next(this.polygonBBoxs);
    if (this.vectorOnMap) {
      this.olMapObject.removeVector(this.vectorOnMap);
    }
    this.vectorOnMap = null;
  }

  public simplifyTo(polyCoords, targetPoints): any {
    const simplify = simplifyjs;
    const dx = polyCoords[0].x - polyCoords[1].x;
    const dy = polyCoords[0].y - polyCoords[1].y;
    // LJ:tolerance will be the sqrt(square distance of point 0&1).
    const toleranceStep = Math.sqrt(dx * dx + dy * dy);
    let tolerance = toleranceStep;
    while (polyCoords.length > targetPoints) {
      polyCoords = simplify(polyCoords, tolerance, false);
      console.log('simplifyTo:' + polyCoords.length);
      tolerance = tolerance + toleranceStep;
    }
    return polyCoords;
  }

}

export interface Polygon {
  name: string,
  srs: string,
  coordinates: string,
  olvector?: olLayerVector
}
