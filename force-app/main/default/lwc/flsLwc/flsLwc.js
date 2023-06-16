import { LightningElement, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import CAN_USE_FLS_AURA_APP from "@salesforce/customPermission/canUseFLSAuraApp";

import getProfileMap from "@salesforce/apex/FieldFlsHelperApex.getPermIdAndProfileNameMap";
import setFLS from "@salesforce/apex/FieldFlsHelperApex.setFLS";

const FIELDS_SECTION = "fields-section";
const PERMS_SECTION = "perms-section";

const PASTE_PROFILES = "Paste Profiles and Permission Sets";
const MANUAL_SELECT = "Search Profiles and Permission Sets";

const FLS_DATALOAD = "FLS dataload";
const FLS_MANUAL = "FLS Manual changes";

const BATCH_SIZE = 1000;

export default class FlsLwc extends LightningElement {
    finalPerms = [];
    copyToFields = [];
    selProfileNames = [];
    fieldParentIds = [];
    modifiedFields = [];
    profileMap = {};
    totColumnsWidth = 0;
    preLoadData = undefined;
    debug = false;

    errors = [];
    isLoading = false;
    profileFilter = MANUAL_SELECT;

    customToast = undefined;

    objNames = [];

    currSection = FIELDS_SECTION;
    operationType = FLS_DATALOAD;
    canUseApp = CAN_USE_FLS_AURA_APP;

    get isFLSDataload() {
        return this.operationType === FLS_DATALOAD;
    }

    get nextLabel() {
        return this.isFLSDataload ? "Import" : "Next";
    }

    get showFieldSelectionSection() {
        return this.currSection === FIELDS_SECTION;
    }

    get showFieldPermissionsSection() {
        return this.currSection === PERMS_SECTION;
    }

    get showSaveBtn() {
        return this.showFieldPermissionsSection;
    }

    get footerClasses() {
        return this.currSection === PERMS_SECTION && this.isLoading === false
            ? "sticky-footer z-index-footer"
            : "sticky-footer";
    }

    get footerWidth() {
        return this.currSection === PERMS_SECTION
            ? this.totColumnsWidth !== 0
                ? `width : ${this.totColumnsWidth}px`
                : `width : ${this.copyToFields.length * 200 + 300}px`
            : "";
    }

    get isAuraApp() {
        return location.pathname === "/c/flsAuraApp.app" || location.pathname.indexOf("apex/") > -1;
    }

    get customToastClasses() {
        return this.customToast.variant === "success"
            ? "slds-notify slds-notify_toast slds-theme_success"
            : "slds-notify slds-notify_toast slds-theme_error";
    }

    get mainClasses() {
        return this.isLoading ? "slds-m-around_xx-small is-loading" : "slds-m-around_xx-small";
    }

    connectedCallback() {
        if (this.canUseApp) {
            const params = this.getQueryParameters();
            if (params.debug) {
                this.debug = true;
            }
            this.getProfileMapFunc();
        }
    }

    handleActiveTab(e) {
        this.operationType = e.target.value;
    }

    handletotColumnsWidthChange({ detail }) {
        this.totColumnsWidth = detail.width;
    }

    handleNext() {
        if (this.isFLSDataload === true) {
            this.getCopyToFieldsAndPermissions();
        } else {
            this.getCopyToFieldsAndProfileFilter();
        }

        if (this.currSection === FIELDS_SECTION) {
            if (this.copyToFields && this.copyToFields.length === 0) {
                this.showNotification("Error !", "error", "Please select atleast one field !");
                return;
            } else if (
                (this.profileFilter === MANUAL_SELECT || this.profileFilter === PASTE_PROFILES) &&
                this.selProfileNames &&
                this.selProfileNames.length === 0
            ) {
                this.showNotification(
                    "Error !",
                    "error",
                    "Please select atleast one Profile or Permission Set or select other Filter !"
                );
                return;
            } else if (this.isFLSDataload === true && this.preLoadData.hasInvalidFieldNames === true) {
                this.showNotification("Error !", "error", "Some fields are not found in the Org !");
                return;
            }
        }

        this.currSection = PERMS_SECTION;
    }

    handleBack() {
        this.currSection = FIELDS_SECTION;
        this.totColumnsWidth = 0;
    }

    getProfileMapFunc() {
        getProfileMap()
            .then((res) => {
                this.profileMap = res;
            })
            .catch((err) => {
                if (this.debug) {
                    console.log("getProfiles Error !", err);
                }
            });
    }

    // get data from fls data load
    getCopyToFieldsAndPermissions() {
        const flsDataloadEle = this.template.querySelector("c-fls-data-load");
        if (flsDataloadEle) {
            const temp = flsDataloadEle.getFLSData();

            this.preLoadData = JSON.parse(JSON.stringify(temp));

            this.copyToFields = this.preLoadData.copyToFields;
            this.profileFilter = MANUAL_SELECT;
            this.selProfileNames = this.preLoadData.profileNames;
            this.fieldParentIds = this.preLoadData.fieldParentIds;

            if (this.debug) {
                console.log("dataload ", this.preLoadData);
            }
        }
    }

    // get copyToFields and profileFilter from fields select
    getCopyToFieldsAndProfileFilter() {
        const fieldSelEle = this.template.querySelector("c-fls-fields-select");
        if (fieldSelEle) {
            const temp = fieldSelEle.getFLSData();
            const x = JSON.parse(JSON.stringify(temp));

            this.copyToFields = x.copyToFields;

            this.profileFilter = x.profileFilter;

            this.selProfileNames = x.selProfileNames;

            this.fieldParentIds = x.fieldParentIds;

            if (this.debug) {
                console.log("Data from fields Section", x);
            }
        }
    }

    getFinalPerms() {
        const permSelEle = this.template.querySelector("c-fls-field-perm-select-modified");
        if (permSelEle) {
            this.finalPerms = permSelEle.getFinalPerms();
            if (this.debug) {
                console.log("this.finalPerms", this.finalPerms);
            }
        }
    }

    handleSave() {
        this.errors = [];
        this.isLoading = true;
        this.getFinalPerms();

        if (this.finalPerms.length > 0) {
            this.setFLSInBatches();
        } else {
            this.showNotification("Error !", "error", "Please modify atleast one FLS");
            this.isLoading = false;
        }
    }

    async setFLSInBatches() {
        let batches = Math.ceil(this.finalPerms.length / BATCH_SIZE);
        let currBatchRecords = this.finalPerms.slice(0, BATCH_SIZE);
        let nextStartIndex = BATCH_SIZE;

        for (let i = 0; i < batches; i++) {
            const errors = await setFLS({ perms: currBatchRecords });
            if (this.debug) {
                console.log("batch ", i, errors);
            }
            if (errors && errors.length > 0) {
                this.errors = [...this.errors, ...errors];
            }

            currBatchRecords = this.finalPerms.slice(nextStartIndex, nextStartIndex + BATCH_SIZE);
            nextStartIndex = nextStartIndex + BATCH_SIZE;
        }

        this.postFLSUpdate();
    }

    postFLSUpdate() {
        if (this.errors.length > 0) {
            console.error("Errors found !", this.errors);
            this.showNotification("Error !", "error", "Partially Updated, please check the console for errors");
        } else {
            this.showNotification("Success", "success", "FLS Updated Successfully!");
        }
        const permSelEle = this.template.querySelector("c-fls-field-perm-select-modified");
        permSelEle.afterSaveFunc();
    }

    toastTimeout = undefined;

    showNotification(title, variant, message) {
        if (this.isAuraApp) {
            if (this.toastTimeout) clearTimeout(this.toastTimeout);
            this.customToast = {
                title: title,
                variant: variant,
                message: message
            };

            this.toastTimeout = setTimeout(() => {
                this.customToast = undefined;
            }, 5000);
        } else {
            const evt = new ShowToastEvent({
                title: title,
                variant: variant,
                message: message
            });
            this.dispatchEvent(evt);
        }
    }

    handleToastClose() {
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.customToast = undefined;
    }

    handleSetLoading({ detail }) {
        this.isLoading = detail.isLoading;
    }

    getQueryParameters() {
        var params = {};
        var search = location.search.substring(1);

        if (search) {
            params = JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g, '":"') + '"}', (key, value) => {
                return key === "" ? value : decodeURIComponent(value);
            });
        }

        return params;
    }
}