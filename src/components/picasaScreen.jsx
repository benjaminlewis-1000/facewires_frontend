import React from 'react';
import './misc.css';
import '../css/menubar.css'
import '../css/sidebar.css'
import '../css/image_tile.css'
import '../css/login.css'
import '../css/imageModal.css'
import store from 'store';
import { Helmet } from 'react-helmet';
import { Redirect } from 'react-router-dom';

import MenuExampleTabular from './tabular_menu'
import { mapWithConcurrency } from './concurrencyPool';
import FolderSidebar from './folderSidebar'
import PersonSidebar from './personSidebar'
import ImageScreen from './imageScreen'
import axiosInstance from './axios_setup'
import { withRetry } from './apiRetry';
import CircleLoader from "react-spinners/CircleLoader";

// Cap how many pagination requests are in flight at once. 5 is a
// reasonable default — enough to get the concurrency win, low enough
// to not hammer the backend even if the dataset grows a lot.
const PAGINATION_CONCURRENCY = 5;

// Owns the text input's own keystroke-by-keystroke state locally.
// PicasaScreen sits above the (large, ~700+ entry) sidebar list, so if
// the input's value lived in PicasaScreen's state instead, every
// keystroke would re-render that whole sidebar along with it - kept
// this isolated so typing only re-renders this small subtree.
class RenameModal extends React.Component {
  constructor(props){
    super(props);
    this.state = { value: props.initialValue };
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleConfirm = this.handleConfirm.bind(this);
  }

  handleChange(e){
    this.setState({ value: e.target.value });
  }

  handleConfirm(){
    this.props.onSubmit(this.state.value);
  }

  handleKeyDown(e){
    if (e.key === 'Enter') this.handleConfirm();
    if (e.key === 'Escape') this.props.onCancel();
  }

  render(){
    return (
      <div className='Overlay RenameOverlay' onClick={this.props.onCancel}>
        <div className='renameModal' onClick={(e) => e.stopPropagation()}>
          <h3>Rename person</h3>
          <input
            type="text"
            autoFocus
            value={this.state.value}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}
          />
          {this.props.error && (
            <div className='renameModalError'>{this.props.error}</div>
          )}
          <div className='renameModalActions'>
            <button className='renameCancelBtn' onClick={this.props.onCancel}>
              Cancel
            </button>
            <button
              className='renameConfirmBtn'
              disabled={this.props.submitting}
              onClick={this.handleConfirm}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }
}

class PicasaScreen extends React.Component{
  
  constructor(props) {
    super(props);

    this.state = {
      people : [], 
      folders: [],
      // people_url: store.get('api_url') + '/people/?fields=person_name,url,num_faces,id,num_possibilities&limit=1000',
      people_url: store.get('api_url') + '/person_list/',
      dir_url: store.get('api_url') + '/folder_list/',
      param_url: store.get('api_url') + '/parameters/',
      loading: true,
      names_fetched: false,
      dirs_fetched: false,
      params_fetched: false,
      tab: 'People',
      unlabeled_toggle: false,
      only_unverified_toggle: false,
      face: false,
      total: false,
      t2: false,
      api_id: 0,
      selectedIndex: -100,

      showRenameModal: false,
      renamePersonId: null,
      renameInitialValue: '',
      renameError: '',
      renameSubmitting: false,
    };
          
    // console.log(this.state.param_url)
    axiosInstance.get(this.state.param_url)    
    .then( (response) => {
      // var info = response.data
      var access_key = response.data.random_access_key;

      this.setState({params_fetched: true})
      store.set('access_key', access_key);

      if (this.state.names_fetched && this.state.dirs_fetched){
        this.setState({loading: false})
      }
    })

    this.updatePersonList = this.updatePersonList.bind(this)
    this.updatePersonCounts = this.updatePersonCounts.bind(this)
    this.updatePersonName = this.updatePersonName.bind(this)
    this.fetchPeopleList = this.fetchPeopleList.bind(this)
    this.openRenameModal = this.openRenameModal.bind(this)
    this.closeRenameModal = this.closeRenameModal.bind(this)
    this.submitRename = this.submitRename.bind(this)

  }

  // How often to reconcile locally-bookkept people counts against the
  // backend's actual numbers (e.g. faces sent back to Unassigned get
  // reassigned by someone else in the background over time).
  static PEOPLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;


  compareNames(a, b) {
    // Use toUpperCase() to ignore character casing
    const nameA = a.person_name.toUpperCase();
    const nameB = b.person_name.toUpperCase();

    let comparison = 0;
    if (nameA > nameB) {
      comparison = 1;
    } else if (nameA < nameB) {
      comparison = -1;
    }
    return comparison;
  }

  componentDidMount(){

    function compareDirectories(a, b) {
      // Use toUpperCase() to ignore character casing
      const timeA = a.first_datesec;
      const timeB = b.first_datesec;
      const yearA = a.year;
      const yearB = b.year;

      let comparison = 0;
      if (yearA > yearB) {
        comparison = 1;
      } else if (yearA < yearB) {
        comparison = -1;
      } else if (yearA === yearB){
        if (timeA > timeB) {
          comparison = 1;
        } else if (timeA < timeB) {
          comparison = -1;
        } 
      }
      // Reverse order - multiply by -1
      return comparison * -1;
    }

    // console.debug("Picasa screen mounted")
    var next_url = this.state.people_url;
    while (next_url !== null){
      // console.log(next_url, next_url !== null)
      // let data = this.getNames(next_url);
      // console.log(data)
      next_url = null
      this.fetchPeopleList(true)
      this.compile_api_list(this.state.dir_url, 'folder_aray').then(
        (resp) =>{
          resp.sort(compareDirectories)
          // console.log("Folder length", resp.length)
          for (var i = resp.length - 1; i >= 0; i--){
            if (resp[i].num_images === 0){
              resp.splice(i, 1)
            }
          }
          // console.log("Folder length after: ", resp.length)
          this.setState({'folders': resp})
          this.setState({dirs_fetched: true}); 
          if (this.state.names_fetched && this.state.params_fetched){
            this.setState({loading: false})
          }

          console.log(this.state)
        }
      )
    }

    this.peopleRefreshInterval = setInterval(
      () => this.fetchPeopleList(false),
      PicasaScreen.PEOPLE_REFRESH_INTERVAL_MS
    )
  }

  componentWillUnmount(){
    clearInterval(this.peopleRefreshInterval)
  }

  // Fetch the people list and refresh state.people. On the initial call
  // (isInitial=true) this also does one-time setup: names_fetched/loading
  // flags and locating the special Unassigned/.ignore person ids. Later
  // calls (from the periodic refresh) just reconcile the counts.
  fetchPeopleList(isInitial){
    return this.compile_api_list(this.state.people_url, 'name_array').then(
      (resp) => {
        resp.sort(this.compareNames)
        resp = resp.filter(element => element.num_faces > 0 || element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === ".ignore")
        this.setState({'people': resp})

        if (isInitial){
          this.setState({names_fetched: true});
          this.setState({api_id: resp[0].id})
          console.log("Getting people")
          console.log(resp)
          if (this.state.dirs_fetched && this.state.params_fetched){
            this.setState({loading: false})
          }
          var unassigned_person_id = resp.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned');
          var ignore_person_id = resp.find(element =>element.person_name === ".ignore" );
          console.log(unassigned_person_id)
          console.log(ignore_person_id)
          this.setState({unassigned_id: unassigned_person_id.id})
          this.setState({ignore_person_id: ignore_person_id.id})

          console.log(this.state)
        } else {
          console.log("Reconciled people counts from backend", resp)
        }
      }
    )
  }


////////////////////////////////////////
///  Get all the names or folders, with a linked list.
////////////////////////////////////////
  compile_api_list = async (base_url, state_field) => {
    try {
      const firstPageResp = await this.fetchAPIURL(base_url);
      const firstPageData = firstPageResp.data;
      let data_array = [...firstPageData.results];

      const pageSize = firstPageData.results.length;
      if (!firstPageData.next || pageSize === 0) {
        return data_array;
      }

      const totalPages = Math.ceil(firstPageData.count / pageSize);
      const remainingUrls = [];
      for (let page = 1; page < totalPages; page++) {
        const url = new URL(base_url);
        url.searchParams.set('limit', pageSize);
        url.searchParams.set('offset', page * pageSize);
        remainingUrls.push(url.toString());
      }

      const remainingResponses = await mapWithConcurrency(
        remainingUrls,
        PAGINATION_CONCURRENCY,
        url => this.fetchAPIURL(url)
      );

      for (const resp of remainingResponses) {
        data_array = data_array.concat(resp.data.results);
      }

      return data_array;
    } catch (e) {
      console.log('error', e);
      return [];
    }
  };


  fetchAPIURL = async (url, sort_function) => {

    const names = new Promise((resolve, reject) => {
        axiosInstance.get(url)
        .then( (response) => {
          resolve({data: response.data});
        }
        , (namelist_error) => {
          console.log("CORS ERROR: ", url,  namelist_error)
        }
        )
        .catch(err => {
            console.log(url, err)
        });
    })
           

    return names

    
  }

////////////////////////////////////////
///  END of name fetching
////////////////////////////////////////


////////////////////////////////////////
///  START of callbacks
////////////////////////////////////////


  logoutclick = (childData) => {
    console.log("Logout")
    store.set('loggedIn', false);
    window.location = "/login"
    return <Redirect to="/login" />;
  }

  tabSelectCallback = (childData) => {
    this.setState({tab: childData})
  }
  
  setApiUrl = (childType, childUrl, childId, index) => {
    // console.debug("API folder: ", childData, childId)
    console.log(index)
    if (childType === 'folder'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
    }else if (childType === 'person'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
    }
    // console.log(this.state.image_api_id)
  }

  setToggle = (childField) => {
    console.debug( "Child field: ", childField)
    // 'unlabeled_toggle' and 'only_unverified_toggle' are mutually exclusive -
    // turning one on flips the other off. Both can be off at once.
    const exclusiveToggles = ['unlabeled_toggle', 'only_unverified_toggle']
    if (exclusiveToggles.includes(childField)){
      this.setState(prevState => {
        const turningOn = !prevState[childField]
        const next = { [childField]: turningOn }
        if (turningOn){
          for (const other of exclusiveToggles){
            if (other !== childField) next[other] = false
          }
        }
        return next
      })
    }else{
      this.setState(prevState => ({
        [childField] : !prevState[childField]
      }))
    }
  }

////////////////////////////////////////
///  END of callbacks
////////////////////////////////////////

  updatePersonList(person_name, api_key, count){
    count = count || 1
    console.log("Updating person list in PicasaScreen", person_name, api_key, this.state.people)
    var new_object = {'id': api_key,
                      'num_faces' : count,
                      'num_possibilities': 0,
                      'num_unverified_faces': count,
                      'person_name': person_name,
                      'url': store.get('api_url') + '/people/' + api_key + '/'}

    var person_list = this.state.people.concat(new_object)
    person_list.sort(this.compareNames)
    this.setState({people: person_list})

    console.log(new_object)
  }

  // Apply local count deltas to state.people so the sidebar reflects
  // face operations immediately, without waiting on a refetch. deltas is
  // an array of {id, num_faces?, num_possibilities?, num_unverified_faces?}
  // where each present field is a signed delta to add (not an absolute value).
  // Reconciled against the backend periodically by fetchPeopleList.
  updatePersonCounts(deltas){
    if (!deltas || deltas.length === 0) return
    this.setState(prevState => {
      const people = prevState.people.map(person => {
        const delta = deltas.find(d => d.id === person.id)
        if (!delta) return person

        const updated = { ...person }
        for (const field of ['num_faces', 'num_possibilities', 'num_unverified_faces']){
          if (delta[field]){
            updated[field] = Math.max(0, (updated[field] || 0) + delta[field])
          }
        }
        return updated
      })
      return { people }
    })
  }

  // Applies a rename locally so the header and sidebar update
  // immediately, without waiting on a refetch. The sidebar re-sorts by
  // name on every render, so this also fixes list ordering.
  updatePersonName(id, newName){
    this.setState(prevState => ({
      people: prevState.people.map(person =>
        person.id === id ? { ...person, person_name: newName } : person
      )
    }))
  }

  // Shared rename trigger for both the sidebar list buttons
  // (personSidebar.jsx) and the selected person's name in the header
  // (imageScreen.jsx) - lives here since both are siblings under this
  // component and need to open the same modal.
  openRenameModal(id, currentName){
    this.setState({
      showRenameModal: true,
      renamePersonId: id,
      renameInitialValue: currentName,
      renameError: '',
      renameSubmitting: false,
    })
  }

  closeRenameModal(){
    this.setState({ showRenameModal: false, renameError: '', renameSubmitting: false })
  }

  submitRename(rawValue){
    const newName = rawValue.trim()
    if (!newName){
      this.setState({ renameError: 'Name cannot be empty.' })
      return
    }

    const id_num = this.state.renamePersonId
    const rename_url = store.get('api_url') + '/people/' + id_num + '/rename/'

    this.setState({ renameSubmitting: true, renameError: '' })

    withRetry(() => axiosInstance.put(rename_url, { person_name: newName }))
      .then(response => {
        this.updatePersonName(id_num, newName)
        this.setState({ showRenameModal: false, renameSubmitting: false })
      })
      .catch(error => {
        const backendError = error.response && error.response.data && error.response.data.error
        this.setState({
          renameSubmitting: false,
          renameError: backendError || "Couldn't rename — please try again.",
        })
      })
  }

  renderSidebar() {

    if ( this.state.tab === "Tools" ){
      return <p>Tools</p>
    }
      
    if ( this.state.tab === "People" ){
      return (
      <div>
        <PersonSidebar people={this.state.people} setSource={this.setApiUrl} unlabeled={this.state.unlabeled_toggle} only_unverified={this.state.only_unverified_toggle} onRenamePerson={this.openRenameModal} />
        <ImageScreen
          tab={this.state.tab}
          api_source={this.state.api_source}
          api_id={this.state.api_id}
          people={this.state.people}
          unassigned_person_id={this.state.unassigned_id}
          ignore_person_id={this.state.ignore_person_id}
          updatePersonList={this.updatePersonList}
          updatePersonCounts={this.updatePersonCounts}
          onRenamePerson={this.openRenameModal}
          unlabeled={this.state.unlabeled_toggle}
          only_unverified={this.state.only_unverified_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }

    if ( this.state.tab === "Folders" ){
      return (
      <div>
        <FolderSidebar folders={this.state.folders} setSource={this.setApiUrl} />
        <ImageScreen 
          tab={this.state.tab} 
          api_source={this.state.api_source} 
          api_id={this.state.api_id} 
          people={this.state.people}
          unlabeled={this.state.unlabeled_toggle}
          only_unverified={this.state.only_unverified_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }
      
    return <p>Unknown state</p>
    
  }

  render() {

    var {history} = this.props;
    return(

      
      <div>

        <Helmet>
          <title>Face Classifier</title>
        </Helmet>

        

        <React.Fragment>
          { this.state.loading ? (
            <div className='spinBackground'>
              <div className="loader">
                <CircleLoader
                // css={override}
                size={250}
                color={"#993333"}
                loading={this.state.loading}
                />
              </div>
              <button className='logoutButton' onClick = {this.logoutclick} >Abort and Logout</button>
            </div>
            ) : (
            <div>
              <MenuExampleTabular
                tabSelectCallback = {this.tabSelectCallback}
                setToggle={this.setToggle}
                onLogout={this.props.onLogout}
                toggleState={{
                  unlabeled_toggle: this.state.unlabeled_toggle,
                  only_unverified_toggle: this.state.only_unverified_toggle,
                  face: this.state.face,
                  total: this.state.total,
                  t2: this.state.t2,
                }}
              />
              <div>
                {this.renderSidebar()}
              </div>

              {this.state.showRenameModal && (
                <RenameModal
                  initialValue={this.state.renameInitialValue}
                  error={this.state.renameError}
                  submitting={this.state.renameSubmitting}
                  onCancel={this.closeRenameModal}
                  onSubmit={this.submitRename}
                />
              )}
            </div>
            )
          }
        </React.Fragment>

      </div>
    );
  }
}


const handleLogout = history => () => {
  console.log("Logging out")
  store.remove('loggedIn');
  // history.push('/login');
  window.location = "/login"
};

export default PicasaScreen;
