import { LoginState, Repository } from "@sensenet/client-core";
import { expect } from "chai";
import { JwtService } from "../src";
import { ILoginResponse } from "../src/ILoginResponse";
import { IRefreshResponse } from "../src/IRefreshResponse";
import { MockTokenFactory } from "./MockTokenFactory";

// tslint:disable:completed-docs
// tslint:disable:no-string-literal
export const jwtServiceTests = describe("JwtService", () => {
    let repo: Repository;
    let jwtService: JwtService;
    beforeEach(() => {
        repo = new Repository({}, (async (info: RequestInfo, init?: RequestInit) => ({} as any)));
        jwtService = new JwtService(repo);
        repo.authentication = jwtService;
    });

    it("can be constructed", () => {
        expect(jwtService).to.be.instanceof(JwtService);
    });

    it("can be constructed with exporation option", () => {
        repo.configuration.sessionLifetime = "expiration";
        const jwtService2 = new JwtService(repo);
        expect(jwtService2).to.be.instanceof(JwtService);
    });

    it("can be disposed with oauth providers", (done: MochaDone) => {
        jwtService.oauthProviders.add({
            login: null as any,
            getToken: null as any,
            dispose: () => {
                done();
            },
        });
        jwtService.dispose();
    });

    describe("#checkForUpdate()", () => {
        it("should return false if not token is set", async () => {
            const hasRefreshed = await jwtService.checkForUpdate();
            expect(hasRefreshed).to.be.eq(false);
        });

        it("should return false if AccessToken is valid", async () => {
            jwtService["tokenStore"].AccessToken = MockTokenFactory.CreateValid();
            const hasRefreshed = await jwtService.checkForUpdate();
            expect(hasRefreshed).to.be.eq(false);
        });

        it("should return true and make a request if AccessToken is invalid but RefreshToken is valid", async () => {
            jwtService["tokenStore"].RefreshToken = MockTokenFactory.CreateValid();
            repo["fetchMethod"] = async () => {
                return {
                    ok: true,
                    json: async () => ({
                        access: MockTokenFactory.CreateValid().toString(),
                        refresh: MockTokenFactory.CreateValid().toString(),
                    } as ILoginResponse),
                };
            };
            const hasRefreshed = await jwtService.checkForUpdate();
            expect(hasRefreshed).to.be.eq(true);
        });
    });

    describe("#execTokenRefresh()", () => {
        it("Should set the state to Authenticated in case of success", async () => {
            jwtService["tokenStore"].RefreshToken = MockTokenFactory.CreateValid();
            repo["fetchMethod"] = async () => {
                return {
                    ok: true,
                    json: async () => ({
                        access: MockTokenFactory.CreateValid().toString(),
                        refresh: MockTokenFactory.CreateValid().toString(),
                    } as IRefreshResponse),
                };
            };
            const hasRefreshed = await jwtService["execTokenRefresh"]();
            expect(hasRefreshed).to.be.eq(true);
            expect(jwtService.state.getValue()).to.be.eq(LoginState.Authenticated);
        });

        it("Should set the state to Unauthenticated in case of request failure", async () => {
            jwtService["tokenStore"].RefreshToken = MockTokenFactory.CreateValid();
            repo["fetchMethod"] = async () => {
                return {
                    ok: false,
                    json: async () => ({}),
                };
            };
            const hasRefreshed = await jwtService["execTokenRefresh"]();
            expect(hasRefreshed).to.be.eq(true);
            expect(jwtService.state.getValue()).to.be.eq(LoginState.Unauthenticated);
        });
    });

    describe("#handleAuthenticationResponse()", () => {
        it("should update the tokens", () => {
            const at = MockTokenFactory.CreateValid().toString();
            const rt =  MockTokenFactory.CreateNotValidYet().toString();
            jwtService.handleAuthenticationResponse({
                access: at,
                refresh: rt,
            });
            expect(jwtService["tokenStore"].AccessToken.toString()).to.be.eq(at);
            expect(jwtService["tokenStore"].RefreshToken.toString()).to.be.eq(rt);
        });

        it("should update status to authenticated if AccessToken is valid", () => {
            const at = MockTokenFactory.CreateValid().toString();
            const rt =  MockTokenFactory.CreateNotValidYet().toString();
            const success = jwtService.handleAuthenticationResponse({
                access: at,
                refresh: rt,
            });
            expect(success).to.be.eq(true);
            expect(jwtService.state.getValue()).to.be.eq(LoginState.Authenticated);
        });

        it("should update status to unauthenticated if AccessToken is invalid", () => {
            const at = MockTokenFactory.CreateExpired().toString();
            const rt =  MockTokenFactory.CreateNotValidYet().toString();
            const success = jwtService.handleAuthenticationResponse({
                access: at,
                refresh: rt,
            });
            expect(success).to.be.eq(false);
            expect(jwtService.state.getValue()).to.be.eq(LoginState.Unauthenticated);
        });
    });

    describe("#login()", () => {
        it("should update status to authenticated if response is ok", async () => {
            repo["fetchMethod"] = async () => {
                return {
                    ok: true,
                    json: async () => ({
                        access: MockTokenFactory.CreateValid().toString(),
                        refresh: MockTokenFactory.CreateValid().toString(),
                    } as ILoginResponse),
                };
            };
            const success = await jwtService.login("user", "pass");
            expect(success).to.be.eq(true);
            expect(jwtService.state.getValue()).to.be.eq(LoginState.Authenticated);
        });

        it("should update status to unauthenticated if response is not ok", async () => {
            repo["fetchMethod"] = async () => {
                return {
                    ok: false,
                    json: async () => ({}),
                };
            };
            const success = await jwtService.login("user", "pass");
            expect(success).to.be.eq(false);
            expect(jwtService.state.getValue()).to.be.eq(LoginState.Unauthenticated);
        });
    });

    describe("#logout()", () => {
        it("should invalidate the tokens", async () => {
            jwtService.handleAuthenticationResponse({
                access: MockTokenFactory.CreateValid().toString(),
                refresh: MockTokenFactory.CreateValid().toString(),
            });
            const success = await jwtService.logout();
            expect(success).to.be.eq(true);
            expect(jwtService["tokenStore"].AccessToken.IsValid()).to.be.eq(false);
            expect(jwtService["tokenStore"].RefreshToken.IsValid()).to.be.eq(false);

        });
    });
});

// @suite("JwtService")
// export class JwtServiceTests {

//     private repo: Repository;
//     private jwtService: JwtService;

//     // tslint:disable-next-line:naming-convention
//     public before() {
//     }

//     @test
//     public "Construct with session persistance"() {
//         const store = this.jwtService["_tokenStore"] as TokenStore;
//         expect(store["_tokenPersist"]).to.be.eq(TokenPersist.Session);
//     }

//     @test
//     public "State change should update global header on HttpProvider to access token head & payload"() {
//         const headers = this.repo.HttpProviderRef.ActualHeaders;
//         const validToken = MockTokenFactory.CreateValid();

//         expect(headers.get("X-Access-Data")).to.be.eq(undefined);

//         (this.jwtService["_tokenStore"] as TokenStore).AccessToken = validToken;
//         this.jwtService.State.SetValue(LoginState.Authenticated);
//         expect(headers.get("X-Access-Data")).to.be.eq(validToken.toString());
//     }

//     @test
//     public "Construct with expiration persistance"() {
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         expect(store["_tokenPersist"]).to.be.eq(TokenPersist.Expiration);
//     }

//     @test
//     public "checkForUpdate should return an observable"() {
//         const obs = this.jwtService.CheckForUpdate();
//         expect(obs).to.be.instanceof(Observable);
//     }

//     @test
//     public "LoginResponse with invalid token sould be emit False"(done: MochaDone) {
//         this.repo.HttpProviderRef.AddResponse({
//             access: "invalidEncodedValue",
//             refresh: "invalidEncodedValue",
//         } as LoginResponse);

//         const obs = this.jwtService.Login("usr", "pass");
//         obs.subscribe((t) => {
//             expect(t).to.be.eq(false);
//             expect(this.jwtService.State.GetValue()).to.be.eq(LoginState.Unauthenticated);
//             done();
//         }, (err) => {
//             done(err);
//         });
//     }

//     @test
//     public "Error response from Http endpoint response sould be emit False"(done: MochaDone) {
//         this.repo.HttpProviderRef.AddError("Error happened :(");
//         const obs = this.jwtService.Login("usr", "pass");
//         obs.subscribe((t) => {
//             expect(t).to.be.eq(false);
//             expect(this.jwtService.State.GetValue()).to.be.eq(LoginState.Unauthenticated);
//             done();
//         }, (err) => {
//             done(err);
//         });
//     }

//     @test public "CheckForUpdate should resolve with false and state should be Authenticated, if the access token is valid"(done: MochaDone) {
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("access", MockTokenFactory.CreateValid());
//         t.CheckForUpdate().first().subscribe((result) => {
//             expect(result).to.be.eq(false);
//             expect(t.State.GetValue()).to.be.eq(LoginState.Authenticated);
//             done();
//         });
//     }

//     @test public "CheckForUpdate should resolve with false and state should be Unauthenticated, if refresh token has been expired"(done: MochaDone) {
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("access", MockTokenFactory.CreateExpired());
//         store.SetToken("refresh", MockTokenFactory.CreateExpired());
//         t.CheckForUpdate().first().subscribe((result) => {
//             expect(result).to.be.eq(false);
//             expect(t.State.GetValue()).to.be.eq(LoginState.Unauthenticated);
//             done();
//         });
//     }

//     @test public "CheckForUpdate should resolve with true and state should be Authenticated, if refresh token is valid, but the access token has been expired and the request was valid"(done: MochaDone) {
//         const refreshToken = MockTokenFactory.CreateValid();
//         this.repo.Config.JwtTokenPersist = "expiration";
//         this.repo.HttpProviderRef.AddResponse({
//             access: MockTokenFactory.CreateValid().toString(),
//             refresh: refreshToken.toString(),
//         });
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("access", MockTokenFactory.CreateExpired());
//         store.SetToken("refresh", refreshToken);
//         t.CheckForUpdate().first().subscribe((result) => {
//             expect(result).to.be.eq(true);
//             expect(t.State.GetValue()).to.be.eq(LoginState.Authenticated);
//             done();
//         });
//     }

//     @test public "CheckForUpdate should resolve with false and state should be Unauthenticated, if refresh token is valid, but the access token has been expired and the request has failed"(done: MochaDone) {
//         const refreshToken = MockTokenFactory.CreateValid();
//         this.repo.Config.JwtTokenPersist = "expiration";
//         this.repo.HttpProviderRef.AddError(new Error("There was some error during the token refresh request."));
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("access", MockTokenFactory.CreateExpired());
//         store.SetToken("refresh", refreshToken);
//         t.CheckForUpdate().first().subscribe((result) => {
//             done("This request should be failed, but it succeeded.");
//         }, (err) => {
//             expect(t.State.GetValue()).to.be.eq(LoginState.Unauthenticated);
//             done();
//         });
//     }

//     @test public "Login should resolve with true and set state to Authenticated, when request succeeded. "(done: MochaDone) {
//         const refreshToken = MockTokenFactory.CreateValid();
//         this.repo.HttpProviderRef.AddResponse({
//             access: MockTokenFactory.CreateValid().toString(),
//             refresh: refreshToken.toString(),
//         });
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         t.Login("user", "pass").first().subscribe((result) => {
//             expect(t.State.GetValue()).to.be.eq(LoginState.Authenticated);
//             done();
//         }, (err) => {
//             done(err);
//         });
//     }

//     @test public "Login should resolve with false and set state to Unauthenticated, when request failed. "(done: MochaDone) {
//         this.repo.HttpProviderRef.AddError(new Error("There was some error during the token refresh request."));
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         t.Login("user", "pass").first().subscribe((result) => {
//             expect(t.State.GetValue()).to.be.eq(LoginState.Unauthenticated);
//             done();
//         }, (err) => {
//             done(err);
//         });
//     }

//     @test public "Logout should invalidate both Access and Refresh tokens"(done: MochaDone) {
//         this.repo.HttpProviderRef.AddResponse({ success: true });
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("access", MockTokenFactory.CreateValid());
//         store.SetToken("refresh", MockTokenFactory.CreateValid());
//         t.CheckForUpdate().subscribe((result) => {
//             expect(t.State.GetValue()).to.be.eq(LoginState.Authenticated);
//             t.Logout().subscribe((newState) => {
//                 expect(t.State.GetValue()).to.be.eq(LoginState.Unauthenticated);
//                 done();
//             });
//         });
//     }

//     @test public "CurrentUser should return BuiltIn\\Visitor by default"() {
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         expect(t.CurrentUser).to.be.eq("BuiltIn\\Visitor");
//     }

//     @test public "CurrentUser should return user from payload when access token is set and valid"() {
//         this.repo.Config.JwtTokenPersist = "expiration";
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("access", MockTokenFactory.CreateValid());
//         expect(t.CurrentUser).to.be.eq("BuiltIn\\Mock");
//     }

//     @test public "CurrentUser should return user from payload when refresh token is set and valid"() {
//         const t = new JwtService(this.repo);
//         const store = t["_tokenStore"] as TokenStore;
//         store.SetToken("refresh", MockTokenFactory.CreateValid());
//         expect(t.CurrentUser).to.be.eq("BuiltIn\\Mock");
//     }

//     @test public "SetOauthProvider should add an Oauth provider"() {
//         const t = new JwtService(this.repo);
//         const provider = new MockOauthProvider();
//         t.SetOauthProvider(provider);

//         expect(t.GetOauthProvider(MockOauthProvider)).to.be.eq(provider);
//     }

//     @test public "SetOauthProvider should throw an error when for duplicated providers"() {
//         const t = new JwtService(this.repo);
//         const provider = new MockOauthProvider();
//         const provider2 = new MockOauthProvider();
//         t.SetOauthProvider(provider);

//         expect(() => { t.SetOauthProvider(provider2); }).to.throw();
//     }

//     @test public "GetOauthProvider should throw an error if there is no Oauth provider registered"() {
//         const t = new JwtService(this.repo);
//         expect(() => { t.GetOauthProvider(MockOauthProvider); }).to.throw();
//     }

// }
