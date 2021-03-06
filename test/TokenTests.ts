import { expect } from "chai";
import { Token } from "../src/Token";
import { MockTokenFactory } from "./MockTokenFactory";

// tslint:disable:completed-docs

export const tokenTests: Mocha.Suite = describe("Token", () => {
    it("should be constructed", () => {
        const t = MockTokenFactory.CreateValid();
        expect(t).to.be.instanceof(Token);
    });

    it("should have a username", () => {
        const t = MockTokenFactory.CreateValid();
        expect(t.Username).to.be.equal("BuiltIn\\Mock");
    });

    it("should have a payload", () => {
        const t = MockTokenFactory.CreateValid();
        expect(t.GetPayload()).to.be.instanceof(Object);
    });

    it("should have an IssuedDate", () => {
        const t = MockTokenFactory.CreateValid();
        expect(t.IssuedDate).to.be.instanceof(Date);
    });

    it("should be able to await its notBefore time", async () => {
        const t = MockTokenFactory.CreateNotValidYet(1000);
        expect(t.IsValid()).to.be.eq(false);
        await t.AwaitNotBeforeTime();
        expect(t.IsValid()).to.be.eq(true);
    });
});
