import React from "react";
import flyd from "flyd";

let kont = {};

export const shallowDiffers = (a, b) => {
  if (!a && b) return true;
  for (let i in a) if (!(i in b)) return true;
  for (let i in b) if (a[i] !== b[i]) return true;
  return false;
};

const resolveContainer = (contid, container) => {
  if (kont[contid]) {
    kont[contid].resolve(container);
  } else {
    kont[contid] = Promise.resolve(container);
  }
};

const getDeferredContainer = contId => {
  if (kont[contId]) {
    return kont[contId];
  }
  let _resolve, _reject;
  let prom = new Promise(function(resolve, reject) {
    _resolve = resolve;
    _reject = reject;
  });
  prom.resolve = _resolve;
  prom.reject = _reject;
  kont[contId] = prom;
  return prom;
};

export const animating = flyd.stream(false);

let rootComponent = null;

export const setRootComponent = root => {
  //root component will be used from the layout libraries, and it is not allowed to re-assign the import
  rootComponent = root;
};

export const getRootComponent = () => rootComponent;

//this is going to be set from ref in the main component

export const openDialog = dialog => {
  if (!rootComponent) {
    return;
  }
  let newDialogs;
  if (!rootComponent.state || !rootComponent.state.dialogs) {
    newDialogs = [];
  } else {
    newDialogs = rootComponent.state.dialogs.slice();
  }
  newDialogs.push(dialog);
  rootComponent.setState({ dialogs: newDialogs });
};

export const closeDialog = () => {
  if (!rootComponent) {
    return;
  }
  let newDialogs = rootComponent.state.dialogs.slice();
  newDialogs.pop();
  rootComponent.setState({ dialogs: newDialogs });
};

export class AppContainer extends React.Component {
  constructor(props) {
    super(props);
    let mp = new maximoplus.basecontrols.AppContainer(
      this.props.mboname,
      this.props.appname
    );
    if (this.props.offlineenabled) {
      mp.setOfflineEnabled(true);
    }
    resolveContainer(this.props.id, mp);
    this.state = { mp: mp };
  }

  render() {
    return <div mboname={this.props.mboname} appname={this.props.appname} />;
  }

  componentWillUnmount() {
    this.state.mp.dispose();
    delete kont[this.props.id];
  }
}

export class RelContainer extends React.Component {
  componentWillMount() {
    getDeferredContainer(this.props.container).then(mboCont => {
      let mp = new maximoplus.basecontrols.RelContainer(
        mboCont,
        this.props.relationship
      );
      this.setState({ mp: mp });
      resolveContainer(this.props.id, mp);
    });
  }

  render() {
    return (
      <div
        container={this.props.container}
        relationship={this.props.relationship}
      />
    );
  }

  compnentWillUnmount() {
    this.state.mp.dispose();
    delete kont[this.props.id];
  }
}

export class MPlusComponent extends React.Component {
  //the following tho methods should be overriden in the concrete implementations with
  //MPlusComponent.prototype.pushDialog = function (dialog)...

  pushDialog(dialog) {
    //this indirection is necessary, becuase wh can override just the prototype function
    openDialog(dialog);
  }

  popDialog() {
    closeDialog();
  }

  componentDidMount() {
    /*
The components that sub-class this component may have the property container or maxcontainer (but not both).
container is string referencing the container (AppContainer, RelContainer...), maxcontainer is the container itself (usually called from the library code).
In case the container property is passed, we have to make sure container is available (promise is resolved), before we initiate the MaximoPlus library component (section, list...)
    */
    if (this.props.container && this.props.maxcontainer) {
      throw Error("can't have both container and maxcontainer as properties");
    }

    if (this.props.container) {
      getDeferredContainer(this.props.container).then(container => {
        this.putContainer(container);
      });
    }
    if (this.props.maxcontainer) {
      this.putContainer(this.props.maxcontainer);
    }
    animating.map(val => this.setState({ animating: val })); //if component is animating don't display the change until the animation is finished
  }

  componentDidUpdate(prevProps) {
    /*If for any reason container is changed in the property, we have to re-initialize*/
    if (this.props.container && this.props.container != prevProps.container) {
      getDeferredContainer(this.props.container).then(container => {
        this.putContainer(container);
      });
    }
    if (
      this.props.maxcontainer &&
      this.props.maxcontainer != prevProps.maxcontainer
    ) {
      this.put.container(this.props.maxcontainer);
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.animating) {
      return false;
    }
    return (
      shallowDiffers(this.props, nextProps) ||
      shallowDiffers(this.state, nextState)
    );
  }

  putContainer() {
    throw Error("should override");
  }

  setInternalState(property, state) {
    //called from the core library
    this.setState((prevState, props) => {
      if (property == "maxfields") {
        //any field can have the new dialog added, we loop all the fields and add the dialog
        //with this we move the dialog from the field level to the top level of the app
        for (let j = 0; j < state.length; j++) {
          let newDialogs = state[j].dialogs;
          if (!newDialogs) {
            continue;
          }
          let prevDialogs =
            prevState.maxfields.length == 0 || !prevState.maxfields[j]
              ? []
              : prevState.maxfields[j].dialogs;
          if (!prevDialogs) {
            prevDialogs = [];
          }
          if (newDialogs.length < prevDialogs.length) {
            this.popDialog();
          }
          if (newDialogs.length > prevDialogs.length) {
            this.pushDialog(newDialogs[0]);
          }
        }
      }
      let ret = {};
      ret[property] = state;
      return ret;
    });
  }

  getInternalState(property) {
    return this.state[property];
  }
}

export function getList(getListTemplate, drawFilterButton, drawList, raw) {
  //sometimes (like for ios template), the rows must not be rendered for the list, we just return the array of properties to be rendered in the parent list component
  return class extends MPlusComponent {
    constructor(props) {
      super(props);
      this.fetchMore = this.fetchMore.bind(this);
      this.pageNext = this.pageNext.bind(this);
      this.pagePrev = this.pagePrev.bind(this);
      if (this.props.dataSetCallback && !this.state) {
        this.props.dataSetCallback({
          fetchMore: this.fetchMore,
          oageNext: this.pageNext,
          pagePrev: this.pagePrev
        });
      }
      this.state = { dataSetInitialized: true };
    }
    initData() {
      this.state.mp.initData();
    }

    //    componentWillMount() {
    //      super.componentWillMount();

    //    }
    putContainer(mboCont) {
      let mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );
      this.mp = mp;
      if (this.props.showWaiting) {
        this.enableLocalWaitSpinner.bind(this)();
      }
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }
      mp.addWrappedComponent(this);
      if (this.props.initdata) {
        mp.initData();
      }
      this.setState({
        mp: mp,
        waiting: false
      });
    }

    enableLocalWaitSpinner() {
      //useful for infinite scroll if we want to display the  spinner below the list. If not enabled, global wait will be used
      this.mp.prepareCall = _ => {
        if (
          this.state.paginator &&
          this.state.paginator.numrows != this.state.paginator.torow
        ) {
          this.setState({ waiting: true, startWait: Date.now() });
        }
      };
      this.mp.finishCall = _ => {
        this.setState({ waiting: false });
      };
    }

    fetchMore(numRows) {
      this.mp.fetchMore(numRows);
    }

    pageNext() {
      this.mp.pageNext();
    }

    pagePrev() {
      this.mp.pagePrev();
    }

    //    componentDidUpdate(prevProps, prevState) {
    //      Object.entries(this.props).forEach(
    //        ([key, val]) =>
    //          prevProps[key] !== val && console.log(`Prop '${key}' changed`)
    //      );
    //      Object.entries(this.state).forEach(
    //        ([key, val]) =>
    //          prevState[key] !== val && console.log(`State '${key}' changed`)
    //      );
    //    }
    render() {
      let drs = [];

      if (this.state && this.state.maxrows) {
        const Template = getListTemplate(this.props.listTemplate);
        if (Template) {
          //raw means don't render the row, return just the props, and parent will take care of rendering with that props
          if (raw) {
            drs = this.state.maxrows.map(o => {
              let _o = Template(o);
              _o.key = o.data["_uniqueid"];
              return _o;
            });
          } else {
            drs = this.state.maxrows.map(o => (
              <Template {...o} key={o.data["_uniqueid"]} />
            ));
          }
        }
      }
      return drawList(drs, this.getFilterButton(), this.state.waiting);
    }

    showFilter() {
      let container = this.props.maxcontainer
        ? this.props.maxcontainer
        : kont[this.props.container];
      this.pushDialog({
        type: "filter",
        maxcontainer: container,
        filtername: this.props.filterTemplate
      });
    }

    getFilterButton() {
      if (this.props.filterTemplate) {
        return drawFilterButton(this.showFilter);
        return <button onClick={ev => this.showFilter()}>Filter</button>;
      }
      return <div />;
    }
  };
}

export function getPickerList(drawPickerOption, drawPicker) {
  return class extends MPlusComponent {
    putContainer(mboCont) {
      let mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }
      mp.addWrappedComponent(this);

      mp.initData();
      this.props.maxpickerfield.addPickerList(mp);
      this.setState({ mp: mp });
    }
    render() {
      let drs = [];
      if (this.state.maxrows) {
        drs = this.state.maxrows.map((object, i) => {
          let selected = object.picked;
          let optionKey = object.data[this.props.pickerkeycol.toUpperCase()];
          let optionVal = object.data[this.props.pickercol.toUpperCase()];
          return drawPickerOption(
            this.props.label,
            selected,
            optionKey,
            optionVal,
            this.props.changeListener
          );
        });
      }
      return drawPicker(this.props.label, this.props.changeListener, drs);
    }
  };
}

export function getSection(WrappedTextField, WrappedPicker, drawFields) {
  //like for the list, here we also support the "raw" rendering, i.e. this HOC returns the data, and parent does the actual rendering. We don't need the raw field for this, if wrappers are null, we just return the props. For picker list,we will have to send the array of values in one field (so we need to transfer the field row state to props)
  return class extends MPlusComponent {
    putContainer(mboCont) {
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      let mp = new maximoplus.re.Section(mboCont, this.props.columns);
      if (this.props.metadata) {
        mp.addColumnsMeta(this.metadata);
      }
      mp.addWrappedComponent(this);
      mp.renderDeferred();
      this.setState({ mp: mp });
    }

    componentDidUpdate(prevProps) {
      super.componentDidUpdate(prevProps);
      if (
        prevProps.metadata != this.props.metadata &&
        this.state &&
        this.state.mp
      ) {
        this.state.mp.addColumnsMeta(this.props.metadata);
      }
    }

    render() {
      let flds = [];
      const raw = !WrappedTextField;
      if (this.state && this.state.maxfields) {
        flds = this.state.maxfields.map((f, i) => {
          let fKey = f.metadata.attributeName + i;
          if (f.metadata.picker && f.picker) {
            let lst = f.picker.list;
            if (lst) {
              if (raw) {
                //TODO this is not good, I want just the array of values and metadata to be passed as a value of the field to concrete implemntation
                //we need to run the internal component and pass it. IDEA: maybe just run the getList over the list container and return the rows only inside the section implementation
                return {
                  label: f.metadata.title,
                  maxcontainer: lst.listContainer,
                  selectableF: lst.selectableF,
                  pickercol: lst.pickerCol,
                  pickerkeycol: lst.pickerKeyCol,
                  columns: [lst.pickerKeyCol, lst.pickerCol],
                  changeListener: f.listeners["change"],
                  maxpickerfield: f.maximoField,
                  enabled: !f.readonly,
                  required: f.required,
                  type: "picker",
                  key: fKey
                };
              }
              return (
                <WrappedPicker
                  label={f.metadata.title}
                  maxcontainer={lst.listContainer}
                  selectableF={lst.selectableF}
                  pickercol={lst.pickerCol}
                  pickerkeycol={lst.pickerKeyCol}
                  columns={[lst.pickerKeyCol, lst.pickerCol]}
                  changeListener={f.listeners["change"]}
                  maxpickerfield={f.maximoField}
                  enabled={!f.readonly}
                  required={f.required}
                  key={fKey}
                />
              );
            } else {
              return raw ? { key: fKey } : <div key={fKey} />;
            }
          } else {
            let attrs = {
              label: f.metadata.title,
              value: f.data,
              type: f.metadata.maxType,
              listener: f.listeners["change"],
              enabled: !f.readonly,
              required: f.required,
              key: fKey
            };
            if (f.metadata.hasLookup) {
              if (f.metadata.gl) {
                attrs.showLookupF = () => f.maximoField.showGlLookup();
              } else {
                attrs.showLookupF = () => f.maximoField.showLookup();
              }
            }
            if (raw) {
              attrs.type = "field";
              return attrs;
            }
            return <WrappedTextField {...attrs} />;
          }
        });
      }
      return drawFields(flds);
    }
  };
}

export function getQbeSection(WrappedTextField, drawFields, drawSearchButtons) {
  return class extends MPlusComponent {
    putContainer(mboCont) {
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      let mp = new maximoplus.re.QbeSection(mboCont, this.props.columns);

      /*
	 Important.
	 The QbeSection in MaximoPlus core library is the only component where column may be the string or the javascript object. The case for javascript object is when we want to search the range in QbeSection. For that we use the standard Maximo functionality - qbePrepend. The columns have to be registered when creating the QbeSection, and the qbePrepend data has to be sent with them, this is why we have that exception. For the case of the components registered with the markup (HTML or JSX, for the web components or React), we already have the metadata defined at the same time as the columns, so we can read this from the metadata itself, and send to the  MaximoPlus constructor.
	 */

      if (this.props.qbePrepends) {
        for (let qp of this.props.qbePrepends) {
          mp.addPrependColumns(
            qp.virtualName,
            qp.qbePrepend,
            qp.attributeName,
            qp.title,
            parseInt(qp.position)
          );
        }
      }

      if (this.props.metadata) {
        mp.addColumnsMeta(this.props.metadata);
      }

      mp.addWrappedComponent(this);
      mp.renderDeferred();
      mp.initData();
      this.setState({ mp: mp });
    }
    clear() {
      this.state.mp.clearQbe();
    }

    search() {
      this.state.mp.getContainer().reset(); //i dont' directly access container, becuase it could have been passed as an attribute through HTML, or directly as an object through JSX
      if (this.state.filterDialog) {
        this.state.filterDialog.closeDialog();
      }
    }

    getSearchButtons() {
      //this may not be necessary, it will render the search buttons for the dialog
      let buttons = [
        { label: "Search", action: ev => this.search() },
        { label: "Clear", action: ev => this.clear() }
      ];
      if (this.state && this.state.filterDialog) {
        buttons.push({
          label: "Cancel",
          action: ev => this.state.filterDialog.closeDialog()
        });
      }
      return drawSearchButtons(buttons);
    }

    render() {
      let flds = [];
      let buttons = this.getSearchButtons();
      if (this.state && this.state.maxfields) {
        flds = this.state.maxfields.map((f, counter) => {
          let attrs = {
            label: f.metadata.title,
            value: f.data,
            type: f.metadata.maxType,
            enabled: true,
            listener: f.listeners["change"],
            key: f.metadata.attributeName + counter
          };
          if (f.metadata.hasLookup) {
            attrs.showLookupF = () => f.maximoField.showLookup();
            attrs.qbe = true; //in qbe mode display only the text field, not the checkbox
          }
          return <WrappedTextField {...attrs} />; //try to put this as a function, to be able to override. There is no indirection, or maybe HOC
        });
      }
      return drawFields(flds, buttons);
    }
  };
}

export function getDialogHolder(getDialogF) {
  return class extends React.Component {
    render() {
      if (!this.props.dialogs || this.props.dialogs.length == 0) {
        return <div />;
      }
      let currDialog = this.props.dialogs[this.props.dialogs.length - 1];
      if (!currDialog) {
        return <div />;
      } else {
        const CurrDialog = getDialogF(currDialog);
        if (CurrDialog) {
          return <CurrDialog {...currDialog} />;
        }
        return <div />;
      }
    }
  };
}

export function getListDialog(WrappedList, drawList) {
  //HOC
  return class extends React.Component {
    render() {
      const LstD = drawList();

      return (
        <LstD {...this.props}>
          <WrappedList
            norows="10"
            listTemplate={this.props.dialog.field.metadata.listTemplate}
            filterTemplate={this.props.dialog.field.metadata.filterTemplate}
            maxcontainer={this.props.dialog.listContainer}
            initdata="true"
            columns={this.props.dialog.dialogCols}
            selectableF={this.props.dialog.defaultAction}
          />
        </LstD>
      );
    }
  };
}

export function getFilterDialog(getFilter, drawFilter) {
  return class extends React.Component {
    render() {
      let kont = this.props.maxcontainer;

      return drawFilter(getFilter(kont, this.props.dialog));
    }
    closeDialog() {
      closeDialog();
    }
  };
}

export function getGLDialog(drawSegments, drawDialog, WrappedList) {
  //glindividualsegment is a function of object with the following keys:
  //- listener
  //- segmentName
  //- segmentValue
  //- segmentDelimiter
  //drawSegments is  a function that draws all the segments into one gl (arg - array of above objects)
  //drawDialog draws the final dialog from all these
  //WrappedList - concreate List implementation
  return class extends React.Component {
    componentDidMpunt() {
      let mp = new maximoplus.re.GLDialog(this.props.field, this.props.orgid);
      mp.addWrappedComponent(this);
      this.setState({ mp: mp });
    }
    getInternalState(property) {
      return this.state[property];
    }

    setInternalState(property, state) {
      let st = {};
      st[property] = state;
      this.setState(st);
    }

    render() {
      let segments = drawSegments(this.state.segments);
      let gllist = (
        <WrappedList
          maxcontainer={this.state.pickerlist.glcontainer}
          columns={this.state.pickerlist.pickercols}
          norows="20"
          initdata="true"
          list-template="gllist"
          selectableF={this.state.pickerlist.pickerf}
        />
      );
      return drawDialog(segments, gllist, this.state.chooseF, closeDialog);
    }
  };
}

export function getWorkflowDialog(
  WrappedSection,
  WrappedActionButton,
  drawDialog
) {
  return class extends MPlusComponent {
    putContainer(mboCont) {
      let mp = new maximoplus.re.WorkflowControl(
        mboCont,
        this.props.processname
      );
      mp.addWrappedComponent(this);
      this.setState({ mp: mp });
      mp.routeWf();
    }
    render() {
      if (
        !this.state.section ||
        !this.state.section.fields ||
        !this.state.actions
      ) {
        return <div />;
      }
      let actionButtons = Object.keys(this.state.actions).map(key => (
        <WrappedActionButton onClick={this.state.actions[key].actionFunction}>
          {this.state.actions[key].label}
        </WrappedActionButton>
      ));
      let metadata = {
        ACTIONID: {
          picker: "true",
          pickerkeycol: "actionid",
          pickercol: "instruction",
          pickerrows: "10"
        }
      };

      if (this.state.section.objectName == "REASSIGNWF") {
        metadata = {
          ASSIGNEE: { hasLookup: "true", listTemplate: "personlist" }
        };
      }
      return drawDialog(
        this.state.title,
        <WrappedSection
          maxcontainer={this.state.section.contaienr}
          columns={this.state.section.fields}
          metadata={metadata}
        />,
        actionButtons
      );
    }
  };
}

export function openWorkflow(container, processname) {
  openDialog({
    type: "workflow",
    processname: processname,
    container: container
  });
}
