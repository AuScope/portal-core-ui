import { NgModule, Optional, SkipSelf, ModuleWithProviders } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {HttpModule} from '@angular/http';
import { BrowserModule } from '@angular/platform-browser';




// Services
import { LayerHandlerService } from './service/cswrecords/layer-handler.service';
import { FilterPanelService } from './service/filterpanel/filterpanel-service';
import { OlMapObject } from './service/openlayermap/ol-map-object';
import { OlMapService } from './service/openlayermap/ol-map.service';
import { RenderStatusService } from './service/openlayermap/renderstatus/render-status.service';
import { ManageStateService } from './service/permanentlink/manage-state.service';
import { DownloadWfsService } from './service/wfs/download/download-wfs.service';
import { OlWMSService } from './service/wms/ol-wms.service';
import { OlWFSService } from './service/wfs/ol-wfs.service';
import { GMLParserService } from './utility/gmlparser.service';
import { LegendService } from './service/wms/legend.service';
import { NotificationService } from './service/toppanel/notification.service';
import { OlCSWService } from './service/wcsw/ol-csw.service';
import { DownloadWcsService } from './service/wcs/download/download-wcs.service';
import { QueryWMSService} from './service/wms/query-wms.service';
import { QueryWFSService} from './service/wfs/query-wfs.service';
import {NgSelectizeModule} from 'ng-selectize';



// Directives
import { ImgLoadingDirective } from './uiutilities/imgloading.directive';
import { StopPropagationDirective } from './utility/utilities.directives';
import { SelectMapBoundingComponent } from './widget/selectmap.bounding';

@NgModule({
  declarations: [
    ImgLoadingDirective,
    StopPropagationDirective,
    SelectMapBoundingComponent
  ],
  imports: [
    HttpClientModule,
    BrowserModule,
    FormsModule,
    HttpModule,
    NgSelectizeModule
  ],
  exports: [ImgLoadingDirective, StopPropagationDirective,
    HttpClientModule, BrowserModule, FormsModule, HttpModule, NgSelectizeModule, SelectMapBoundingComponent],
  providers: [LayerHandlerService,
    OlWMSService,
    OlMapObject,
    OlWFSService,
    DownloadWfsService,
    DownloadWcsService,
    GMLParserService,
    RenderStatusService,
    FilterPanelService,
    LegendService,
    ImgLoadingDirective,
    NotificationService,
    QueryWMSService,
    QueryWFSService,
    ManageStateService,
    OlCSWService
  ]
})

export class PortalCoreModule {

  static forRoot(config: any): ModuleWithProviders {
    return {
      ngModule: PortalCoreModule,
      providers: [
        OlMapService,
        {provide: 'env', useValue: config}
      ],
    };
  }

  constructor (@Optional() @SkipSelf() parentModule: PortalCoreModule) {
    if (parentModule) {
      throw new Error(
        'CoreModule is already loaded. Import it in the AppModule only');
    }
  }



}
