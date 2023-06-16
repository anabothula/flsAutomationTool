import { api, LightningElement } from "lwc";

import getFLS from "@salesforce/apex/FieldFlsHelperApex.getFLS";

export default class FlsFieldPermSelectModified extends LightningElement {
    @api copyToProfiles = [];
    @api fieldParentIds = [];
    @api profileFilter;
    @api profileMap = {};
    @api preLoadData = undefined;
    @api isDataload = false;
    @api isDebug = false;

    tableFieldHeaders = [];
    _copyToFields = [];
    @api
    get copyToFields() {
        return this._copyToFields;
    }

    set copyToFields(value) {
        if (this.isDebug) {
            console.log("got copyToFields ", value);
        }
        this._copyToFields = JSON.parse(JSON.stringify(value));

        if (this._copyToFields && this._copyToFields.length > 0) {
            this._copyToFields.forEach((x) => {
                const parts = x.split(".");
                const found = this._copyToFields.findIndex(
                    (field) => field.split(".")[1] === parts[1] && field.split(".")[0] !== parts[0]
                );
                this.tableFieldHeaders = [
                    ...this.tableFieldHeaders,
                    {
                        fieldName: found > -1 ? x : parts[1],
                        sObjectType: parts[0],
                        fullName: x
                    }
                ];
            });
        }
    }

    permissionSets = [];
    finalPermsMap = {};
    oldPermsMap = {};
    selectedPermIds = [];
    selectedFields = [];
    showBoxShadowForProfileName = false;
    postSaveRetrieve = false;
    profileColSelected = false;
    allFieldsSelected = false;
    columnWidth = 200;
    totalColsWidth = 0;

    get disableBulkFLSChange() {
        return this.selectedPermIds.length === 0 || this.selectedFields.length === 0;
    }

    get disableColumnWidth() {
        return this.selectedFields.length === 0 && this.profileColSelected === false;
    }

    get copyToFieldsLength() {
        return this.copyToFields.length;
    }

    get disabledMessage() {
        return this.disableBulkFLSChange ? "Please Select altleast one profile and one field" : "";
    }

    get options() {
        return [
            { label: "None", value: "none" },
            { label: "Read Only", value: "Read Only" },
            { label: "Edit", value: "Edit" }
        ];
    }

    get actionsWrapperWidth() {
        return this.totalColsWidth !== 0
            ? `width : ${this.totalColsWidth}px`
            : `width : ${this.copyToFields.length * 200 + 300}px`;
    }

    get theadClass() {
        if (this.isAuraApp) {
            return "aura-app";
        }
        return location.hostname.indexOf("sandbox") > -1 ? "sandbox" : "production";
    }

    get isAuraApp() {
        return location.pathname === "/c/flsAuraApp.app" || location.pathname.indexOf("apex/") > -1;
    }

    get columnWidthStyle() {
        return `width : ${this.columnWidth}px`;
    }

    get profileNameColClasses() {
        return this.showBoxShadowForProfileName ? "slds-truncate profile-name-col" : "slds-truncate";
    }

    get allFieldSelectLabel() {
        return this.allFieldsSelected ? "UnSelect All Fields" : "Select All Fields";
    }

    connectedCallback() {
        this.setLoading(true);
        this.getFLSFunc();
        window.addEventListener("scroll", this.scrollListener);
    }

    disconnectedCallback() {
        window.removeEventListener("scroll", this.scrollListener);
    }

    scrollListener = () => {
        this.showBoxShadowForProfileName = window.scrollX > 10;
    };

    getFLSFunc() {
        getFLS({
            profileNames: this.copyToProfiles,
            parentIds: this.fieldParentIds,
            fieldNames: this.copyToFields,
            profileFilter: this.profileFilter,
            allParentIds: Object.values(this.profileMap)
        })
            .then((perms) => {
                if (this.isDebug) {
                    console.log("getFLS", perms);
                }
                this.createMapsForState(perms);

                this.structureData(perms);
            })
            .catch((err) => {
                if (this.isDebug) {
                    console.log("getFLS", err);
                }
            })
            .finally(() => {
                this.setLoading(false);
            });
    }

    createMapsForState(perms) {
        perms.forEach((perm) => {
            if (perm.FieldPerms && perm.FieldPerms.length > 0) {
                perm.FieldPerms.forEach((x) => {
                    if (this.copyToFields.includes(x.Field)) {
                        this.finalPermsMap[`${x.ParentId}.${x.Field}`] = JSON.parse(JSON.stringify(x));
                        this.oldPermsMap[`${x.ParentId}.${x.Field}`] = JSON.parse(JSON.stringify(x));
                    }
                });
            }
        });
    }

    structureData(perms) {
        this.permissionSets = [];
        perms.forEach((perm) => {
            let temp = {};
            temp.Id = perm.Id;
            temp.Name = perm.IsOwnedByProfile ? perm.Profile.Name : perm.Name;
            temp.href = `/${perm.ProfileId}`;
            let fields = [];

            this.copyToFields.forEach((i) => {
                let key = `${temp.Id}.${i}`;
                let value = this.finalPermsMap[key];
                if (value === undefined) {
                    value = {
                        ParentId: temp.Id,
                        Field: i,
                        SobjectType: i.split(".")[0],
                        PermissionsEdit: false,
                        PermissionsRead: false
                    };

                    this.finalPermsMap[key] = value;
                }
                value.key = key;
                this.convertBoolToVal(value.PermissionsEdit, value.PermissionsRead, value);
                value.oldSelVal = value.selVal;
                if (this.isDataload && this.postSaveRetrieve === false) {
                    const newVal = this.preLoadData.finalPermsMap[key];
                    value.PermissionsEdit = newVal.PermissionsEdit;
                    value.PermissionsRead = newVal.PermissionsRead;
                    this.convertBoolToVal(value.PermissionsEdit, value.PermissionsRead, value);
                }
                value.ProfileName = perm.IsOwnedByProfile ? perm.Profile.Name : perm.Name;
                fields = [...fields, value];
            });

            temp.fields = fields;

            this.permissionSets = [...this.permissionSets, temp];
        });

        if (this.isDebug) {
            console.log("final permissionssets", this.permissionSets);
        }
    }

    @api
    getFinalPerms() {
        let x = [];
        try {
            Object.values(this.finalPermsMap).forEach((y) => {
                if (y.Id !== undefined) {
                    const oldVal = this.oldPermsMap[`${y.ParentId}.${y.Field}`];
                    if (oldVal.PermissionsEdit !== y.PermissionsEdit || oldVal.PermissionsRead !== y.PermissionsRead) {
                        x = [...x, y];
                    }
                } else if (y.Id === undefined && (y.PermissionsEdit === true || y.PermissionsRead === true)) {
                    x = [...x, y];
                }
            });
        } catch (err) {
            if (this.isDebug) {
                console.log(err);
            }
        }

        return x;
    }

    @api
    afterSaveFunc() {
        this.postSaveRetrieve = true;
        this.oldPermsMap = {};
        this.finalPermsMap = {};
        this.getFLSFunc();
    }

    handleColWidthOnChange(e) {
        if (this.disableColumnWidth === false) {
            this.changeColumnWidth(e.target.value);
        }
    }

    handleColWidthOnBlur(e) {
        if (this.disableColumnWidth === false) {
            this.changeColumnWidth(e.target.value);
            this.uncheckAllBoxes();

            const columnWidthEvt = new CustomEvent("columnwidth", {
                detail: { width: this.totalColsWidth }
            });
            this.dispatchEvent(columnWidthEvt);
        }
    }

    changeColumnWidth(value) {
        const cols = this.template.querySelectorAll("col");
        if (cols) {
            this.totalColsWidth = 0;
            cols.forEach((col) => {
                if (this.selectedFields.indexOf(col.className) > -1) {
                    col.style.width = value + "px";
                }
                this.totalColsWidth = this.totalColsWidth + Number(col.style.width.replace("px", ""));
            });
        }

        if (this.profileColSelected) {
            this.template.querySelector("col.profile-col").style.width = value + "px";
        }
    }

    handlePermChange(event) {
        const temp = event.detail.field;
        const key = `${temp.ParentId}.${temp.Field}`;

        const value = this.finalPermsMap[key];
        value.selVal = temp.selVal;
        this.convertValToBool(value.selVal, value);
        this.permissionSets = [...this.permissionSets];
        if (this.isDebug) {
            console.log(this.permissionSets);
        }
    }

    // change all the fls to value that was selected on the combo box values(Edit, Read Only, none)
    handleBulkFLSChange(event) {
        this.setLoading(true);
        const selVal = event.detail.value;
        if (this.isDebug) {
            console.log("bulk selected value", selVal, this.selectedFields);
        }

        try {
            if (this.selectedPermIds && this.selectedPermIds.length > 0 && this.selectedFields.length > 0) {
                this.selectedPermIds.forEach((permId) => {
                    this.selectedFields.forEach((field) => {
                        const perm = this.finalPermsMap[`${permId}.${field}`];
                        perm.selVal = selVal;
                        this.convertValToBool(selVal, perm);
                    });
                });
                this.permissionSets = [...this.permissionSets];
                if (this.isDebug) {
                    console.log(this.permissionSets);
                }
                this.uncheckAllBoxes();
                this.template.querySelector(".set-as lightning-combobox").value = undefined;
            }
        } catch (error) {
            if (this.isDebug) {
                console.log("handleBulkSelect", error);
            }
        }

        this.setLoading(false);
    }

    // uncheck all the checkboxes after the bulk fls change is completed
    uncheckAllBoxes() {
        const boxes = this.template.querySelectorAll(".checkbox-select");
        if (boxes) {
            boxes.forEach((box) => {
                box.checked = false;
            });

            this.selectedPermIds = [];
            this.selectedFields = [];
            this.profileColSelected = false;
            this.allFieldsSelected = false;
        }
    }

    // select all the profiles to change
    handleBulkProfileCheck({ target }) {
        const checked = target.checked;
        this.profileColSelected = checked;
        const permsBoxes = this.template.querySelectorAll(".profile-sel");
        if (permsBoxes) {
            this.selectedPermIds = [];
            permsBoxes.forEach((box) => {
                box.checked = checked;
                if (checked === true) {
                    this.selectedPermIds = [...this.selectedPermIds, box.dataset.id];
                } else {
                    this.selectedPermIds = [];
                }
            });
        }

        if (this.isDebug) {
            console.log(this.selectedPermIds, this.selectedPermIds.length);
        }
    }

    handleBulkFieldCheck() {
        this.allFieldsSelected = !this.allFieldsSelected;
        const fieldBoxes = this.template.querySelectorAll(".field-header-select");
        if (fieldBoxes) {
            this.selectedFields = [];
            fieldBoxes.forEach((box) => {
                box.checked = this.allFieldsSelected;
                if (this.allFieldsSelected === true) {
                    this.selectedFields = [...this.selectedFields, box.dataset.name];
                } else {
                    this.selectedFields = [];
                }
            });
        }

        if (this.isDebug) {
            console.log(this.selectedFields);
        }
    }

    // select which field fls should be changed for the selected profiles
    handleFieldSelect({ target }) {
        const checked = target.checked;
        const fieldName = target.dataset.name;

        if (checked === true) {
            this.selectedFields = [...this.selectedFields, fieldName];
        } else {
            this.selectedFields = this.selectedFields.filter((x) => x !== fieldName);
        }

        this.allFieldsSelected = this.selectedFields.length === this.copyToFields.length;

        if (this.isDebug) {
            console.log(this.selectedFields, this.selectedFields.length);
        }
    }

    // will handle when the profile checkbox is changed
    handleProfileSelect({ target }) {
        const checked = target.checked;
        const permId = target.dataset.id;

        if (checked === true) {
            this.selectedPermIds = [...this.selectedPermIds, permId];
        } else {
            this.selectedPermIds = this.selectedPermIds.filter((x) => x !== permId);
        }

        if (this.isDebug) {
            console.log(this.selectedPermIds, this.selectedPermIds.length);
        }

        this.checkBulkProfileSelect();
    }

    // will check or uncheck if all the profiles are checked or not
    checkBulkProfileSelect() {
        const checked = this.selectedPermIds.length === this.permissionSets.length;
        this.template.querySelector(".bulk-profile-select").checked = checked;
    }

    convertValToBool(val, perm) {
        if (val === "Edit") {
            perm.PermissionsEdit = true;
            perm.PermissionsRead = true;
        } else if (val === "Read Only") {
            perm.PermissionsEdit = false;
            perm.PermissionsRead = true;
        } else {
            perm.PermissionsEdit = false;
            perm.PermissionsRead = false;
        }
    }

    convertBoolToVal(edit, read, perm) {
        if (edit && read) {
            perm.selVal = "Edit";
        } else if (!edit && read) {
            perm.selVal = "Read Only";
        } else {
            perm.selVal = "none";
        }
    }

    setLoading(isLoading) {
        const loadingEvt = new CustomEvent("loading", {
            detail: { isLoading: isLoading }
        });
        this.dispatchEvent(loadingEvt);
    }

    // export
    handleExport() {
        if (this.isDebug) {
            console.log("Export started !", this.finalPermsMap);
        }

        const headers = [
            "Id",
            "ParentId",
            "Field",
            "SobjectType",
            "PermissionsEdit",
            "PermissionsRead",
            "ProfileName",
            "key"
        ];
        let csvData = "";
        csvData = csvData + headers.join(",");

        Object.keys(this.finalPermsMap).forEach((key) => {
            let record = this.finalPermsMap[key];
            let row = [];
            headers.forEach((h) => {
                row.push(record[h]);
            });

            csvData = csvData + "\n" + row.join(",");
        });

        this.donwnloadFile(csvData);
    }

    donwnloadFile(csvData) {
        let downloadElement = document.createElement("a");

        downloadElement.href = "data:text/csv;charset=utf-8," + encodeURI(csvData);
        downloadElement.target = "_self";
        downloadElement.download = `FLS Import ${new Date().toISOString()}.csv`;
        document.body.appendChild(downloadElement);
        downloadElement.click();
    }
}