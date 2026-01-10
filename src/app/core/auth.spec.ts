import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth';
import { Auth } from '@angular/fire/auth';

describe('Auth', () => {
  let service: Auth;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Auth);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
