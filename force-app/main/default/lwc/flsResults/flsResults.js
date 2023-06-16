import { LightningElement, api } from "lwc";

const COLUMNS = [
    { label: "Profile Name", fieldName: "profileName" },
    { label: "Field", fieldName: "fieldName" },
    { label: "Error", fieldName: "error" }
];

export default class FlsResults extends LightningElement {
    columns = COLUMNS;

    @api errors;
    @api modifiedFields;

    get hasErrors() {
        return this.errors && this.errors.length > 0;
    }
}