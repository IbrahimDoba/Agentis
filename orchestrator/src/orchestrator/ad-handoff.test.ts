import { describe, it, expect } from "vitest"
import { matchAdHandoffKeyword } from "./ad-handoff.js"

const carAd = {
  title: "JUST IN 🚘 #LEXUS ES 350",
  body: "✨2014 ..Fullest Option✨\n◆ Price: ₦17.3M\n◆ Status: Foreign Used\n\nBuy right. Drive right. #JUSTFITSCARS\n#CarsForSale #Abuja",
}
const capAd = { title: "Justfitsng", body: "Premium motorsport caps — Ferrari, Benz, Red Bull. Order on WhatsApp." }

describe("matchAdHandoffKeyword", () => {
  it("matches a car ad case-insensitively", () => {
    expect(matchAdHandoffKeyword(carAd, ["#justfitscars"])).toBe("#justfitscars")
    expect(matchAdHandoffKeyword(carAd, ["JUSTFITSCARS"])).toBe("JUSTFITSCARS")
  })
  it("does not match a caps ad", () => {
    expect(matchAdHandoffKeyword(capAd, ["#justfitscars"])).toBeNull()
  })
  it("matches on the headline alone", () => {
    expect(matchAdHandoffKeyword({ title: "New in: #JustFitsCars", body: null }, ["#justfitscars"])).toBe("#justfitscars")
  })
  it("is off when there are no keywords, no ad, or an empty ad", () => {
    expect(matchAdHandoffKeyword(carAd, [])).toBeNull()
    expect(matchAdHandoffKeyword(null, ["#justfitscars"])).toBeNull()
    expect(matchAdHandoffKeyword({ title: "", body: "" }, ["#justfitscars"])).toBeNull()
  })
  it("ignores blank keywords so they can't match everything", () => {
    expect(matchAdHandoffKeyword(capAd, ["", "   "])).toBeNull()
  })
})
