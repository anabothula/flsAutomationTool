import { api, LightningElement, wire } from "lwc";

import getObjectNames from "@salesforce/apex/FieldFlsHelperApex.getObjectNames";
import getFieldNames from "@salesforce/apex/FieldFlsHelperApex.getFieldNames";
import getProfileFilters from "@salesforce/apex/FieldFlsHelperApex.getProfileFilters";

const PASTE_PROFILES = "Paste Profiles and Permission Sets";
const MANUAL_SELECT = "Search Profiles and Permission Sets";

export default class FlsFieldsSelect extends LightningElement {
    @api selFieldApiNames = [];
    @api profileFilter = undefined;
    @api profileMap = {};
    @api isDebug = false;

    objectNames = undefined;
    selObjfieldOpts = undefined;
    selObjName = "Account";

    selProfileNames = [];
    pastedProfileNames = [];
    invalidProfileNames = [];
    profileSearchKey = "";
    availableProfiles = [];

    fieldSearchKey = "";
    availableFields = [];

    profileFilterOpts = [{ label: "All", value: "All" }];
    preDefinedProfilesMap = {};

    @wire(getProfileFilters, {})
    getProfileFiltersWire({ error, data }) {
        if (data) {
            if (this.isDebug) {
                console.log("getProfileFiltersWire", data);
            }
            data.forEach((x) => {
                // create a map of filternames and their profiles
                let temp = this.preDefinedProfilesMap[x.Profile_Filter_Name__c];
                if (temp) {
                    temp = [...temp, x.Profile_Name__c];
                } else {
                    this.profileFilterOpts = [
                        ...this.profileFilterOpts,
                        { label: x.Profile_Filter_Name__c, value: x.Profile_Filter_Name__c }
                    ];
                    temp = [x.Profile_Name__c];
                }

                this.preDefinedProfilesMap[x.Profile_Filter_Name__c] = temp;

                // add the filter names to the filter profile opts
            });

            this.profileFilterOpts = [
                ...this.profileFilterOpts,
                { label: PASTE_PROFILES, value: PASTE_PROFILES },
                { label: MANUAL_SELECT, value: MANUAL_SELECT }
            ];
        }
    }

    get disableObjSelect() {
        return this.objectNames === undefined;
    }

    get disableFieldSelect() {
        return this.selObjfieldOpts === undefined || this.selObjfieldOpts.length === 0;
    }

    get isProfileManualSelect() {
        return this.profileFilter === MANUAL_SELECT;
    }

    get isPastedProfileNamesSelected() {
        return this.profileFilter === PASTE_PROFILES;
    }

    get hasSelectedProfiles() {
        return this.selProfileNames && this.selProfileNames.length > 0;
    }

    get hasInvalidProfileNames() {
        return this.invalidProfileNames && this.invalidProfileNames.length > 0;
    }

    connectedCallback() {
        this.getObjectNamesFunc();
        this.availableProfiles = Object.keys(this.profileMap);
    }

    @api
    getFLSData() {
        return {
            copyToFields: this.selFieldApiNames,
            profileFilter: this.profileFilter,
            selProfileNames: this.getFinalSelectedProfileNames(),
            fieldParentIds: this.getFieldParentIds()
        };
    }

    getFinalSelectedProfileNames() {
        return this.profileFilter === MANUAL_SELECT || this.profileFilter === PASTE_PROFILES
            ? this.selProfileNames
            : this.preDefinedProfilesMap[this.profileFilter] || [];
    }

    getFieldParentIds() {
        const profileNames = this.getFinalSelectedProfileNames();
        const parentIds = [];
        profileNames.forEach((x) => {
            parentIds.push(this.profileMap[x]);
        });

        return parentIds;
    }

    getObjectNamesFunc() {
        getObjectNames()
            .then((res) => {
                this.objectNames = res;
                this.getFieldNamesFunc();
                if (this.isDebug) {
                    console.log("getObjectNames", res);
                }
            })
            .catch((err) => {
                if (this.isDebug) {
                    console.log("Error getObjectNames", err);
                }
            });
    }

    handleOnChange({ target, detail }) {
        const name = target.name;
        if (name === "selObjName") {
            this.selObjName = detail.value;
            this.getFieldNamesFunc();
        }

        if (name === "fieldSearchKey") {
            this.fieldSearchKey = detail.value;
            this.updateAvailableProfilesAndFields("field");
        }

        if (name === "profileSearchKey") {
            this.profileSearchKey = detail.value;
            this.updateAvailableProfilesAndFields("profile");
        }

        if (name === "profileFilter") {
            this.selProfileNames = [];
            this.profileFilter = detail.value;
        }

        if (name === "profile") {
            this.handleProfileSearch(detail);
        }
    }

    getFieldNamesFunc() {
        this.selObjfieldOpts = [];
        this.availableFields = [];
        getFieldNames({
            objName: this.selObjName
        })
            .then((res) => {
                if (this.isDebug) {
                    console.log("getFieldNames", this.selObjName, "fields", res);
                }
                this.selObjfieldOpts = [...res];
                this.updateAvailableProfilesAndFields("field");
            })
            .catch((err) => {
                if (this.isDebug) {
                    console.log("getFieldNames Error", err);
                }
            });
    }

    handleSelect(event) {
        event.preventDefault();
        event.stopPropagation();

        const type = event.target.dataset.type;

        if (type === "field") {
            const fieldName = event.target.dataset.fieldName;

            this.selFieldApiNames = [fieldName, ...this.selFieldApiNames];
            this.updateAvailableProfilesAndFields("field");
        }

        if (type === "profile") {
            const profileName = event.target.dataset.profileName;

            this.selProfileNames = [...this.selProfileNames, profileName];
            this.updateAvailableProfilesAndFields("profile");
        }
    }

    handleRemove({ target }) {
        const type = target.dataset.type;
        if (type === "field") {
            const fieldApiName = target.dataset.fieldApiName;
            this.selFieldApiNames = this.selFieldApiNames.filter((x) => x !== fieldApiName);
            this.updateAvailableProfilesAndFields("field");
        }

        if (type === "profile") {
            const profileName = target.dataset.profileName;
            this.selProfileNames = this.selProfileNames.filter((x) => x !== profileName);
            this.updateAvailableProfilesAndFields("profile");
        }
    }

    handleProfileNamesPaste({ detail }) {
        const value = detail.value;
        if (this.isDebug) {
            console.log("Pasted profile names ", value, value.split("\n"));
        }

        if (value && value.length > 0) {
            this.selProfileNames = [];
            this.invalidProfileNames = [];
            value.split("\n").forEach((x) => {
                if (this.profileMap[x] !== undefined) {
                    this.selProfileNames = [...this.selProfileNames, x];
                } else {
                    this.invalidProfileNames = [...this.invalidProfileNames, x];
                }
            });
        }
    }

    updateAvailableProfilesAndFields(type) {
        if (type === "field") {
            this.availableFields = this.selObjfieldOpts.filter(
                (x) =>
                    x.toLowerCase().indexOf(this.fieldSearchKey.toLowerCase()) > -1 &&
                    !this.selFieldApiNames.includes(x)
            );
        } else {
            this.availableProfiles = Object.keys(this.profileMap).filter(
                (x) =>
                    x.toLowerCase().indexOf(this.profileSearchKey.toLowerCase()) > -1 &&
                    !this.selProfileNames.includes(x)
            );
        }
    }
}