import type { BindingAnchor } from "shared"

// Which store entity each anchor maps to.
export const ANCHOR_ENTITIES: Record<BindingAnchor, string> = {
  client: "contact",
}

export interface AllowedAttribute {
  attribute: string
  // The most a binding on this attribute may ever allow, whatever the
  // store and the DBS's account would permit.
  maxAccess: "read" | "readWrite"
}

// The attributes a data steward may create bindings on -- the real
// security boundary of the binding creator (docs/proposals/databound-fields.md,
// guardrail 1). Approved by a data owner and changed in code review, never
// from the creator itself.
//
// Deliberately absent, though the store would let a binding update them:
// adx_identity_* (portal credentials), csg_dssid (the DEX client ID),
// csg_health_care_card_id / csg_pension_card_id / csg_fahcsiaid (government
// identifiers), csg_slk* (statistical linkage keys), and anything carrying
// FDR case content (§17).
export const ALLOW_LIST: Record<BindingAnchor, AllowedAttribute[]> = {
  client: [
    { attribute: "csg_salutationid", maxAccess: "readWrite" },
    { attribute: "firstname", maxAccess: "readWrite" },
    { attribute: "middlename", maxAccess: "readWrite" },
    { attribute: "lastname", maxAccess: "readWrite" },
    { attribute: "csg_alias", maxAccess: "readWrite" },
    { attribute: "rawa_preferredgender", maxAccess: "readWrite" },
    { attribute: "csg_genderid", maxAccess: "readWrite" },
    { attribute: "csg_home_languageid", maxAccess: "readWrite" },
    { attribute: "mobilephone", maxAccess: "readWrite" },
    { attribute: "telephone2", maxAccess: "readWrite" },
    { attribute: "emailaddress1", maxAccess: "readWrite" },
    // The client's identifier: displayable, never editable from a form.
    { attribute: "csg_clientid", maxAccess: "read" },
  ],
}

export function allowedAttribute(
  anchor: BindingAnchor,
  attribute: string,
): AllowedAttribute | undefined {
  return ALLOW_LIST[anchor].find((entry) => entry.attribute === attribute)
}
