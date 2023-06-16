import { LightningElement, api } from "lwc";
import validateFields from "@salesforce/apex/FieldFlsHelperApex.validateFields";

export default class FlsDataLoad extends LightningElement {
    @api profileMap = undefined;
    @api isDebug = false;

    file = undefined;

    dataMap = {};
    fieldNames = [];
    profileNames = [];
    invalidFieldNames = [];
    validFieldNames = [];
    fieldParentIds = [];

    @api
    getFLSData() {
        return {
            copyToFields: this.validFieldNames,
            profileNames: this.profileNames,
            finalPermsMap: this.dataMap,
            fieldParentIds: this.fieldParentIds,
            hasInvalidFieldNames: this.invalidFieldNames.length > 0
        };
    }

    handleUpload(e) {
        if (this.isDebug) {
            console.log(e.target.files);
        }
        this.resetVars();
        this.setLoading(true);
        if (e.target.files && e.target.files[0]) {
            this.file = e.target.files[0];
            this.parseTheFile();
        }
    }

    resetVars() {
        this.fieldNames = [];
        this.profileNames = [];
        this.dataMap = {};
        this.invalidFieldNames = [];
    }

    parseTheFile() {
        const reader = new FileReader();
        reader.addEventListener("load", (e) => {
            this.parse(e.target.result);
        });
        reader.readAsText(this.file);
    }

    parse(csv) {
        const lines = csv.split(/\r\n|\n/);

        const headers = lines[0].split(",");

        this.columns = headers.map((header) => {
            return { label: header, fieldName: header };
        });

        const data = [];

        lines.forEach((line, i) => {
            if (i === 0) return;

            let obj = {};
            const currentline = line.split(",");

            for (let j = 0; j < headers.length; j++) {
                const header = headers[j];
                const value = currentline[j];
                if (value === undefined) break;
                if (header === "ProfileName") {
                    obj.ParentId = this.profileMap[value];
                    obj.ProfileName = value;
                } else if (header === "Field") {
                    obj.Field = value;
                } else if (header === "PermissionsEdit") {
                    obj.PermissionsEdit = value.toLowerCase() === "true";
                } else if (header === "PermissionsRead") {
                    obj.PermissionsRead = value.toLowerCase() === "true";
                }
            }

            if (obj.ParentId) {
                obj.key = `${obj.ParentId}.${obj.Field}`;

                if (this.fieldNames.includes(obj.Field) === false) {
                    this.fieldNames.push(obj.Field);
                }

                if (this.profileNames.includes(obj.ProfileName) === false) {
                    this.fieldParentIds.push(obj.ParentId);
                    this.profileNames.push(obj.ProfileName);
                }

                this.dataMap[obj.key] = obj;
            }
        });

        if (this.isDebug) {
            console.log(this.dataMap, this.profileNames, this.fieldNames);
        }

        this.validateFieldsFunc();
    }

    validateFieldsFunc() {
        validateFields({
            fieldNames: this.fieldNames
        })
            .then((res) => {
                if (this.isDebug) {
                    console.log("existing fields", res);
                }
                this.fieldNames.forEach((x) => {
                    if (res.includes(x)) {
                        this.validFieldNames = [...this.validFieldNames, x];
                    } else {
                        this.invalidFieldNames = [...this.invalidFieldNames, x];
                    }
                });
            })
            .catch((err) => {
                if (this.isDebug) {
                    console.log("validateFields", err);
                }
            })
            .finally(() => {
                this.setLoading(false);
            });
    }

    setLoading(isLoading) {
        const loadingEvt = new CustomEvent("loading", {
            detail: { isLoading: isLoading }
        });
        this.dispatchEvent(loadingEvt);
    }
}