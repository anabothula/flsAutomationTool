import { api, LightningElement } from "lwc";

export default class CustomSelectCmp extends LightningElement {
    _field;
    _selVal = "none";
    selectEle = undefined;

    renderedCallback() {
        if (this.selectEle === undefined) {
            this.selectEle = this.template.querySelector("select");
        }
        if (this.selectEle && this.selectEle.value !== this._selVal) {
            this.selectEle.value = this._selVal;
        }
    }

    @api oldSelVal = undefined;

    @api get selVal() {
        return this._selVal;
    }

    set selVal(value) {
        this._selVal = value;
        this.setAttribute("_selVal", value);
    }

    @api get field() {
        return this._field;
    }

    set field(value) {
        this._field = JSON.parse(JSON.stringify(value));
    }

    get wrapperDivClasses() {
        return this.oldSelVal !== undefined && this.oldSelVal !== this.selVal
            ? "select-wrapper value-changed-style"
            : "select-wrapper";
    }

    get options() {
        return [
            { label: "None", value: "none", selected: this._selVal === "none" },
            { label: "Read Only", value: "Read Only", selected: this._selVal === "Read Only" },
            { label: "Edit", value: "Edit", selected: this._selVal === "Edit" }
        ];
    }

    handleOnChange({ target }) {
        this._selVal = target.value;
        this._field.selVal = target.value;

        const changeEvt = new CustomEvent("permchange", {
            detail: { field: this._field }
        });
        this.dispatchEvent(changeEvt);
    }
}