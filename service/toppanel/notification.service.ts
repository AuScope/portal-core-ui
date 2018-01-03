import { Injectable, Inject } from '@angular/core';
import { Http, Response } from '@angular/http';
import { Observable } from 'rxjs/Observable';

/**
 * Service class for the twitter notification
 */
@Injectable()
export class NotificationService {
  constructor(private http: Http, @Inject('env') private env) {

  }
  /**
   * gets the notification from twitter
   * @return a observable that contains the twitter notification
   */
  getNotifications() {
    return this.http.get(this.env.portalBaseUrl + 'getNotifications.do')
      .map(
        (response: Response) => {
          const data = response.json();
          return data;
        }
      )
      .catch(
        (error: Response) => {
          return Observable.throw(error);
        }
      )
    }
}
